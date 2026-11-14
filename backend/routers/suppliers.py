"""Suppliers. Everyone can read, only admins can change."""
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query

import db
from deps import current_user, require_admin
from errors import ApiError
from schemas import SupplierIn

router = APIRouter(prefix="/suppliers", tags=["Suppliers"])

SELECT = """
    SELECT s.id, s.name, s.contact_person, s.phone, s.email, s.address, s.gstin, s.is_active, s.created_at,
           (SELECT COUNT(*) FROM products p WHERE p.supplier_id = s.id AND p.is_active) AS product_count,
           (SELECT COUNT(*) FROM purchase_orders o
             WHERE o.supplier_id = s.id AND o.status IN ('draft', 'ordered')) AS open_orders
      FROM suppliers s
"""


@router.get("")
def list_suppliers(
    q: Optional[str] = Query(None, max_length=80),
    status: Literal["all", "active", "inactive"] = "all",
    user=Depends(current_user),
):
    where, params = [], []
    if q:
        where.append("(s.name ILIKE %s OR s.contact_person ILIKE %s OR s.gstin ILIKE %s)")
        params += [db.like(q)] * 3
    if status != "all":
        where.append("s.is_active = %s")
        params.append(status == "active")
    sql = SELECT + (" WHERE " + " AND ".join(where) if where else "") + " ORDER BY s.is_active DESC, lower(s.name)"
    return db.fetch_all(sql, params)


@router.get("/{supplier_id}")
def get_supplier(supplier_id: int, user=Depends(current_user)):
    row = db.fetch_one(SELECT + " WHERE s.id = %s", (supplier_id,))
    if not row:
        raise ApiError(404, "Supplier not found.", code="not_found")
    return row


@router.post("", status_code=201)
def create_supplier(body: SupplierIn, admin=Depends(require_admin)):
    new = db.fetch_one(
        """INSERT INTO suppliers (name, contact_person, phone, email, address, gstin, is_active)
           VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id""",
        (body.name, body.contact_person, body.phone, body.email, body.address, body.gstin, body.is_active),
    )
    return db.fetch_one(SELECT + " WHERE s.id = %s", (new["id"],))


@router.put("/{supplier_id}")
def update_supplier(supplier_id: int, body: SupplierIn, admin=Depends(require_admin)):
    changed = db.execute(
        """UPDATE suppliers SET name = %s, contact_person = %s, phone = %s, email = %s,
                  address = %s, gstin = %s, is_active = %s WHERE id = %s""",
        (body.name, body.contact_person, body.phone, body.email, body.address, body.gstin,
         body.is_active, supplier_id),
    )
    if not changed:
        raise ApiError(404, "Supplier not found.", code="not_found")
    return db.fetch_one(SELECT + " WHERE s.id = %s", (supplier_id,))


@router.delete("/{supplier_id}", status_code=204)
def delete_supplier(supplier_id: int, admin=Depends(require_admin)):
    with db.transaction() as cur:
        cur.execute(
            """SELECT (SELECT COUNT(*) FROM products WHERE supplier_id = %(id)s) AS products,
                      (SELECT COUNT(*) FROM purchase_orders WHERE supplier_id = %(id)s) AS orders,
                      (SELECT COUNT(*) FROM stock_movements WHERE supplier_id = %(id)s) AS movements""",
            {"id": supplier_id},
        )
        used = cur.fetchone()
        if used["products"] or used["orders"] or used["movements"]:
            raise ApiError(
                409,
                "This supplier has products, orders or stock history, so it cannot be deleted. Deactivate it instead.",
                code="in_use",
            )
        cur.execute("DELETE FROM suppliers WHERE id = %s", (supplier_id,))
        if cur.rowcount == 0:
            raise ApiError(404, "Supplier not found.", code="not_found")
