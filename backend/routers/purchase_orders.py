"""Purchase orders: draft -> ordered -> received (or cancelled).

Receiving an order is one transaction: every line is posted to the stock ledger
as a receipt and the order is marked received. If any line fails, nothing changes.
"""
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query
from psycopg2.extras import execute_values

import config
import db
from deps import current_user, require_admin
from errors import ApiError
from schemas import PurchaseOrderIn
from services.common import paged
from services.stock import post_movement

router = APIRouter(prefix="/purchase-orders", tags=["Purchase orders"])

PO_SELECT = """
    SELECT o.id, o.po_number, o.supplier_id, s.name AS supplier_name, o.status, o.expected_date, o.notes,
           o.created_at, o.ordered_at, o.received_at, o.cancelled_at, u.name AS created_by_name,
           COALESCE(t.item_count, 0) AS item_count,
           COALESCE(t.total_units, 0) AS total_units,
           COALESCE(t.total_amount, 0) AS total_amount
      FROM purchase_orders o
      JOIN suppliers s ON s.id = o.supplier_id
      LEFT JOIN users u ON u.id = o.created_by
      LEFT JOIN (
            SELECT purchase_order_id, COUNT(*) AS item_count, SUM(quantity) AS total_units,
                   SUM(quantity * unit_cost) AS total_amount
              FROM purchase_order_items GROUP BY purchase_order_id
      ) t ON t.purchase_order_id = o.id
"""

ITEMS_SELECT = """
    SELECT i.id, i.product_id, p.sku, p.name AS product_name, p.unit, i.quantity, i.unit_cost,
           (i.quantity * i.unit_cost) AS line_total, p.qty_on_hand
      FROM purchase_order_items i JOIN products p ON p.id = i.product_id
     WHERE i.purchase_order_id = %s ORDER BY i.id
"""


def load_po(cur, po_id, items=True):
    cur.execute(PO_SELECT + " WHERE o.id = %s", (po_id,))
    po = cur.fetchone()
    if not po:
        raise ApiError(404, "Purchase order not found.", code="not_found")
    if items:
        cur.execute(ITEMS_SELECT, (po_id,))
        po["items"] = cur.fetchall()
    return po


def validate_lines(cur, body: PurchaseOrderIn):
    cur.execute("SELECT is_active FROM suppliers WHERE id = %s", (body.supplier_id,))
    supplier = cur.fetchone()
    if not supplier:
        raise ApiError(422, "Supplier not found.", errors={"supplier_id": "Choose an existing supplier."})
    if not supplier["is_active"]:
        raise ApiError(422, "Supplier is inactive.", errors={"supplier_id": "This supplier is inactive."})

    ids = [i.product_id for i in body.items]
    cur.execute("SELECT id, is_active FROM products WHERE id = ANY(%s)", (ids,))
    found = {row["id"]: row for row in cur.fetchall()}
    errors = {}
    for index, item in enumerate(body.items):
        product = found.get(item.product_id)
        if not product:
            errors[f"items.{index}.product_id"] = "Product not found."
        elif not product["is_active"]:
            errors[f"items.{index}.product_id"] = "This product is archived."
    if errors:
        raise ApiError(422, "Some products cannot be ordered.", code="validation_error", errors=errors)


def insert_items(cur, po_id, body: PurchaseOrderIn):
    execute_values(
        cur,
        "INSERT INTO purchase_order_items (purchase_order_id, product_id, quantity, unit_cost) VALUES %s",
        [(po_id, i.product_id, i.quantity, i.unit_cost) for i in sorted(body.items, key=lambda x: x.product_id)],
    )


def next_number(cur):
    cur.execute(
        """SELECT 'PO-' || to_char(now() AT TIME ZONE %s, 'YYYY') || '-'
                  || lpad(nextval('po_number_seq')::text, 4, '0') AS number""",
        (config.APP_TIMEZONE,),
    )
    return cur.fetchone()["number"]


@router.get("")
def list_orders(
    status: Literal["all", "open", "draft", "ordered", "received", "cancelled"] = "all",
    supplier_id: Optional[int] = Query(None, gt=0),
    q: Optional[str] = Query(None, max_length=80),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user=Depends(current_user),
):
    where, params = [], []
    if status == "open":
        where.append("o.status IN ('draft', 'ordered')")
    elif status != "all":
        where.append("o.status = %s")
        params.append(status)
    if supplier_id:
        where.append("o.supplier_id = %s")
        params.append(supplier_id)
    if q:
        where.append("(o.po_number ILIKE %s OR s.name ILIKE %s)")
        params += [db.like(q)] * 2
    where_sql = " WHERE " + " AND ".join(where) if where else ""
    with db.transaction() as cur:
        cur.execute(
            "SELECT COUNT(*) AS n FROM purchase_orders o JOIN suppliers s ON s.id = o.supplier_id" + where_sql,
            params,
        )
        total = cur.fetchone()["n"]
        cur.execute(
            PO_SELECT + where_sql + " ORDER BY o.created_at DESC, o.id DESC LIMIT %s OFFSET %s",
            params + [page_size, (page - 1) * page_size],
        )
        items = cur.fetchall()
    return paged(items, total, page, page_size)


@router.get("/{po_id}")
def get_order(po_id: int, user=Depends(current_user)):
    with db.transaction() as cur:
        return load_po(cur, po_id)


@router.post("", status_code=201)
def create_order(body: PurchaseOrderIn, user=Depends(current_user)):
    with db.transaction() as cur:
        validate_lines(cur, body)
        cur.execute(
            """INSERT INTO purchase_orders (po_number, supplier_id, expected_date, notes, created_by)
               VALUES (%s, %s, %s, %s, %s) RETURNING id""",
            (next_number(cur), body.supplier_id, body.expected_date, body.notes, user["id"]),
        )
        po_id = cur.fetchone()["id"]
        insert_items(cur, po_id, body)
        return load_po(cur, po_id)


@router.put("/{po_id}")
def update_order(po_id: int, body: PurchaseOrderIn, user=Depends(current_user)):
    """Edit a draft. Once an order is placed it is fixed."""
    with db.transaction() as cur:
        cur.execute("SELECT status FROM purchase_orders WHERE id = %s FOR UPDATE", (po_id,))
        row = cur.fetchone()
        if not row:
            raise ApiError(404, "Purchase order not found.", code="not_found")
        if row["status"] != "draft":
            raise ApiError(409, "Only draft orders can be edited.", code="not_draft")
        validate_lines(cur, body)
        cur.execute(
            "UPDATE purchase_orders SET supplier_id = %s, expected_date = %s, notes = %s WHERE id = %s",
            (body.supplier_id, body.expected_date, body.notes, po_id),
        )
        cur.execute("DELETE FROM purchase_order_items WHERE purchase_order_id = %s", (po_id,))
        insert_items(cur, po_id, body)
        return load_po(cur, po_id)


def _lock(cur, po_id, allowed, action):
    cur.execute("SELECT * FROM purchase_orders WHERE id = %s FOR UPDATE", (po_id,))
    po = cur.fetchone()
    if not po:
        raise ApiError(404, "Purchase order not found.", code="not_found")
    if po["status"] not in allowed:
        raise ApiError(
            409, f"A {po['status']} order cannot be {action}.", code="bad_status", status=po["status"]
        )
    return po


@router.post("/{po_id}/order")
def place_order(po_id: int, admin=Depends(require_admin)):
    """Admin approves a draft and marks it as sent to the supplier."""
    with db.transaction() as cur:
        _lock(cur, po_id, ("draft",), "placed")
        cur.execute("UPDATE purchase_orders SET status = 'ordered', ordered_at = now() WHERE id = %s", (po_id,))
        return load_po(cur, po_id)


@router.post("/{po_id}/receive")
def receive_order(po_id: int, user=Depends(current_user)):
    """Goods arrived: post every line as a stock receipt, all or nothing."""
    with db.transaction() as cur:
        po = _lock(cur, po_id, ("ordered",), "received")
        cur.execute(
            "SELECT product_id, quantity, unit_cost FROM purchase_order_items "
            "WHERE purchase_order_id = %s ORDER BY product_id",
            (po_id,),
        )
        for line in cur.fetchall():
            post_movement(
                cur, product_id=line["product_id"], kind="receipt", quantity=line["quantity"],
                user_id=user["id"], supplier_id=po["supplier_id"], unit_cost=line["unit_cost"],
                reference=po["po_number"], reason="purchase_order", purchase_order_id=po_id,
            )
        cur.execute("UPDATE purchase_orders SET status = 'received', received_at = now() WHERE id = %s", (po_id,))
        return load_po(cur, po_id)


@router.post("/{po_id}/cancel")
def cancel_order(po_id: int, admin=Depends(require_admin)):
    with db.transaction() as cur:
        _lock(cur, po_id, ("draft", "ordered"), "cancelled")
        cur.execute("UPDATE purchase_orders SET status = 'cancelled', cancelled_at = now() WHERE id = %s", (po_id,))
        return load_po(cur, po_id)


@router.post("/from-low-stock", status_code=201)
def create_from_low_stock(user=Depends(current_user)):
    """One draft order per supplier for every product that needs restocking.
    Products already on an open order, or without a supplier, are skipped."""
    with db.transaction() as cur:
        cur.execute(
            """SELECT p.id, p.supplier_id, p.cost_price,
                      GREATEST(p.reorder_level * 2 - p.qty_on_hand, 1) AS qty,
                      EXISTS (SELECT 1 FROM purchase_order_items i
                                JOIN purchase_orders o ON o.id = i.purchase_order_id
                               WHERE i.product_id = p.id AND o.status IN ('draft', 'ordered')) AS on_open_order,
                      COALESCE(s.is_active, FALSE) AS supplier_ok
                 FROM products p LEFT JOIN suppliers s ON s.id = p.supplier_id
                WHERE p.is_active AND p.qty_on_hand <= p.reorder_level
                ORDER BY p.supplier_id, p.id"""
        )
        candidates = cur.fetchall()

        skipped_open = sum(1 for c in candidates if c["on_open_order"])
        skipped_supplier = sum(1 for c in candidates if not c["on_open_order"] and not c["supplier_ok"])
        by_supplier = {}
        for c in candidates:
            if not c["on_open_order"] and c["supplier_ok"]:
                by_supplier.setdefault(c["supplier_id"], []).append(c)

        created = []
        for supplier_id, lines in by_supplier.items():
            cur.execute(
                """INSERT INTO purchase_orders (po_number, supplier_id, notes, created_by)
                   VALUES (%s, %s, 'Suggested from low stock', %s) RETURNING id""",
                (next_number(cur), supplier_id, user["id"]),
            )
            po_id = cur.fetchone()["id"]
            execute_values(
                cur,
                "INSERT INTO purchase_order_items (purchase_order_id, product_id, quantity, unit_cost) VALUES %s",
                [(po_id, line["id"], line["qty"], line["cost_price"]) for line in lines],
            )
            created.append(load_po(cur, po_id, items=False))
    return {"created": created, "skipped_no_supplier": skipped_supplier, "skipped_already_ordered": skipped_open}
