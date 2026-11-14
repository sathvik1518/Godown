"""Products: search, filter, sort, paginate, create, edit, archive, export."""
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query

import db
from deps import current_user, require_admin
from errors import ApiError
from services.common import csv_response, csv_text, paged
from services.stock import post_movement
from schemas import ProductIn, ProductUpdate

router = APIRouter(prefix="/products", tags=["Products"])

STATUS_SQL = (
    "CASE WHEN p.qty_on_hand = 0 THEN 'out' "
    "WHEN p.qty_on_hand <= p.reorder_level THEN 'low' ELSE 'ok' END"
)

BASE_SELECT = f"""
    SELECT p.id, p.sku, p.name, p.category_id, c.name AS category_name,
           p.supplier_id, s.name AS supplier_name, p.unit, p.cost_price, p.sell_price,
           p.reorder_level, p.qty_on_hand, p.location, p.is_active, p.created_at, p.updated_at,
           (p.qty_on_hand * p.cost_price) AS stock_value,
           {STATUS_SQL} AS stock_status
      FROM products p
      JOIN categories c ON c.id = p.category_id
      LEFT JOIN suppliers s ON s.id = p.supplier_id
"""

SORTS = {
    "name": "lower(p.name)",
    "sku": "p.sku",
    "qty": "p.qty_on_hand",
    "value": "(p.qty_on_hand * p.cost_price)",
    "price": "p.sell_price",
    "updated": "p.updated_at",
}

StatusFilter = Literal["all", "alerts", "low", "out", "ok", "archived"]


def build_filters(q, category_id, supplier_id, status):
    where, params = [], []
    where.append("NOT p.is_active" if status == "archived" else "p.is_active")
    if q:
        where.append("(p.name ILIKE %s OR p.sku ILIKE %s)")
        params += [db.like(q)] * 2
    if category_id:
        where.append("p.category_id = %s")
        params.append(category_id)
    if supplier_id:
        where.append("p.supplier_id = %s")
        params.append(supplier_id)
    if status == "low":
        where.append("p.qty_on_hand > 0 AND p.qty_on_hand <= p.reorder_level")
    elif status == "out":
        where.append("p.qty_on_hand = 0")
    elif status == "alerts":
        where.append("p.qty_on_hand <= p.reorder_level OR p.qty_on_hand = 0")
        where[-1] = "(" + where[-1] + ")"
    elif status == "ok":
        where.append("p.qty_on_hand > p.reorder_level")
    return " WHERE " + " AND ".join(where), params


def load_product(cur, product_id):
    cur.execute(BASE_SELECT + " WHERE p.id = %s", (product_id,))
    row = cur.fetchone()
    if not row:
        raise ApiError(404, "Product not found.", code="not_found")
    return row


def check_links(cur, category_id=None, supplier_id=None):
    """Friendly field errors when a dropdown value no longer exists."""
    if category_id is not None:
        cur.execute("SELECT 1 FROM categories WHERE id = %s", (category_id,))
        if not cur.fetchone():
            raise ApiError(422, "Category not found.", errors={"category_id": "Choose an existing category."})
    if supplier_id is not None:
        cur.execute("SELECT is_active FROM suppliers WHERE id = %s", (supplier_id,))
        row = cur.fetchone()
        if not row:
            raise ApiError(422, "Supplier not found.", errors={"supplier_id": "Choose an existing supplier."})
        if not row["is_active"]:
            raise ApiError(422, "Supplier is inactive.", errors={"supplier_id": "This supplier is inactive."})


@router.get("")
def list_products(
    q: Optional[str] = Query(None, max_length=80),
    category_id: Optional[int] = Query(None, gt=0),
    supplier_id: Optional[int] = Query(None, gt=0),
    status: StatusFilter = "all",
    sort: Literal["name", "sku", "qty", "value", "price", "updated"] = "name",
    order: Literal["asc", "desc"] = "asc",
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user=Depends(current_user),
):
    where_sql, params = build_filters(q, category_id, supplier_id, status)
    with db.transaction() as cur:
        cur.execute(
            "SELECT COUNT(*) AS n FROM products p" + where_sql, params
        )
        total = cur.fetchone()["n"]
        cur.execute(
            BASE_SELECT + where_sql + f" ORDER BY {SORTS[sort]} {order.upper()}, p.id LIMIT %s OFFSET %s",
            params + [page_size, (page - 1) * page_size],
        )
        items = cur.fetchall()
    return paged(items, total, page, page_size)


@router.get("/summary")
def summary(user=Depends(current_user)):
    return db.fetch_one(
        """SELECT COUNT(*) FILTER (WHERE is_active) AS total,
                  COUNT(*) FILTER (WHERE is_active AND qty_on_hand > 0 AND qty_on_hand <= reorder_level) AS low,
                  COUNT(*) FILTER (WHERE is_active AND qty_on_hand = 0) AS out,
                  COUNT(*) FILTER (WHERE NOT is_active) AS archived
             FROM products"""
    )


@router.get("/export.csv")
def export_products(
    q: Optional[str] = Query(None, max_length=80),
    category_id: Optional[int] = Query(None, gt=0),
    supplier_id: Optional[int] = Query(None, gt=0),
    status: StatusFilter = "all",
    user=Depends(current_user),
):
    where_sql, params = build_filters(q, category_id, supplier_id, status)
    rows = db.fetch_all(BASE_SELECT + where_sql + " ORDER BY lower(p.name)", params)
    header = ["SKU", "Name", "Category", "Supplier", "Unit", "On hand", "Reorder level", "Status",
              "Cost price", "Selling price", "Stock value", "Location"]
    body = [
        [r["sku"], csv_text(r["name"]), r["category_name"], csv_text(r["supplier_name"] or ""), r["unit"],
         r["qty_on_hand"], r["reorder_level"], r["stock_status"], r["cost_price"], r["sell_price"],
         r["stock_value"], csv_text(r["location"] or "")]
        for r in rows
    ]
    return csv_response("godown-products.csv", header, body)


@router.get("/{product_id}")
def get_product(product_id: int, user=Depends(current_user)):
    with db.transaction() as cur:
        product = load_product(cur, product_id)
        cur.execute(
            """SELECT COALESCE(-SUM(quantity) FILTER (WHERE movement_type = 'issue'
                                    AND created_at >= now() - interval '30 days'), 0) AS issued_30d,
                      MAX(created_at) AS last_movement_at
                 FROM stock_movements WHERE product_id = %s""",
            (product_id,),
        )
        stats = cur.fetchone()
        cur.execute(
            """SELECT COALESCE(SUM(i.quantity), 0) AS on_order
                 FROM purchase_order_items i JOIN purchase_orders o ON o.id = i.purchase_order_id
                WHERE i.product_id = %s AND o.status = 'ordered'""",
            (product_id,),
        )
        on_order = cur.fetchone()["on_order"]
    issued = int(stats["issued_30d"])
    product["issued_30d"] = issued
    product["last_movement_at"] = stats["last_movement_at"]
    product["on_order"] = int(on_order)
    product["days_of_cover"] = round(product["qty_on_hand"] / (issued / 30)) if issued else None
    return product


@router.post("", status_code=201)
def create_product(body: ProductIn, user=Depends(require_admin)):
    with db.transaction() as cur:
        check_links(cur, body.category_id, body.supplier_id)
        cur.execute(
            """INSERT INTO products (sku, name, category_id, supplier_id, unit, cost_price, sell_price,
                                     reorder_level, location)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
            (body.sku, body.name, body.category_id, body.supplier_id, body.unit, body.cost_price,
             body.sell_price, body.reorder_level, body.location),
        )
        product_id = cur.fetchone()["id"]
        if body.opening_stock > 0:
            post_movement(
                cur, product_id=product_id, kind="receipt", quantity=body.opening_stock,
                user_id=user["id"], reference="Opening stock", reason="opening_stock",
            )
        return load_product(cur, product_id)


@router.patch("/{product_id}")
def update_product(product_id: int, body: ProductUpdate, user=Depends(require_admin)):
    changes = body.model_dump(exclude_unset=True)
    with db.transaction() as cur:
        check_links(cur, changes.get("category_id"), changes.get("supplier_id"))
        sets = [f"{column} = %s" for column in changes] + ["updated_at = now()"]
        cur.execute(
            f"UPDATE products SET {', '.join(sets)} WHERE id = %s",
            list(changes.values()) + [product_id],
        )
        if cur.rowcount == 0:
            raise ApiError(404, "Product not found.", code="not_found")
        return load_product(cur, product_id)


@router.delete("/{product_id}", status_code=204)
def delete_product(product_id: int, user=Depends(require_admin)):
    with db.transaction() as cur:
        cur.execute(
            """SELECT (SELECT COUNT(*) FROM stock_movements WHERE product_id = %(id)s) AS movements,
                      (SELECT COUNT(*) FROM purchase_order_items WHERE product_id = %(id)s) AS orders""",
            {"id": product_id},
        )
        used = cur.fetchone()
        if used["movements"] or used["orders"]:
            raise ApiError(
                409,
                "This product has stock history, so it cannot be deleted. Archive it instead to keep the records.",
                code="has_history",
            )
        cur.execute("DELETE FROM products WHERE id = %s", (product_id,))
        if cur.rowcount == 0:
            raise ApiError(404, "Product not found.", code="not_found")
