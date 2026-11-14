"""Stock receipts, issues, adjustments and the movement ledger."""
from datetime import date
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query

import config
import db
from deps import current_user, require_admin
from errors import ApiError
from schemas import AdjustmentIn, IssueIn, ReceiptIn
from services.common import csv_response, csv_text, paged
from services.stock import MOVEMENT_SELECT, post_movement

router = APIRouter(tags=["Stock"])


def _supplier_must_exist(cur, supplier_id):
    if supplier_id is None:
        return
    cur.execute("SELECT is_active FROM suppliers WHERE id = %s", (supplier_id,))
    row = cur.fetchone()
    if not row:
        raise ApiError(422, "Supplier not found.", errors={"supplier_id": "Choose an existing supplier."})


@router.post("/stock/receipts", status_code=201)
def receive_stock(body: ReceiptIn, user=Depends(current_user)):
    """Goods received: adds to stock."""
    with db.transaction() as cur:
        _supplier_must_exist(cur, body.supplier_id)
        return post_movement(
            cur, product_id=body.product_id, kind="receipt", quantity=body.quantity,
            user_id=user["id"], supplier_id=body.supplier_id, unit_cost=body.unit_cost,
            reference=body.reference, reason="purchase", note=body.note,
        )


@router.post("/stock/issues", status_code=201)
def issue_stock(body: IssueIn, user=Depends(current_user)):
    """Goods leaving the shop: removes from stock, never below zero."""
    with db.transaction() as cur:
        return post_movement(
            cur, product_id=body.product_id, kind="issue", quantity=body.quantity,
            user_id=user["id"], reference=body.reference, reason=body.reason, note=body.note,
        )


@router.post("/stock/adjustments", status_code=201)
def adjust_stock(body: AdjustmentIn, user=Depends(require_admin)):
    """Admin sets the stock to the counted quantity. The difference is logged."""
    with db.transaction() as cur:
        return post_movement(
            cur, product_id=body.product_id, kind="adjustment", new_quantity=body.new_quantity,
            user_id=user["id"], reason=body.reason, note=body.note,
        )


def _filters(product_id, type_, date_from, date_to, q):
    where, params = [], []
    if product_id:
        where.append("m.product_id = %s")
        params.append(product_id)
    if type_:
        where.append("m.movement_type = %s")
        params.append(type_)
    if date_from:
        where.append("(m.created_at AT TIME ZONE %s)::date >= %s")
        params += [config.APP_TIMEZONE, date_from]
    if date_to:
        where.append("(m.created_at AT TIME ZONE %s)::date <= %s")
        params += [config.APP_TIMEZONE, date_to]
    if q:
        where.append("(p.name ILIKE %s OR p.sku ILIKE %s OR m.reference ILIKE %s OR m.note ILIKE %s)")
        params += [db.like(q)] * 4
    if date_from and date_to and date_from > date_to:
        raise ApiError(
            422, "The start date is after the end date.",
            errors={"date_from": "Start date must be before the end date."},
        )
    return (" WHERE " + " AND ".join(where) if where else ""), params


MovementType = Optional[Literal["receipt", "issue", "adjustment"]]


@router.get("/movements")
def list_movements(
    product_id: Optional[int] = Query(None, gt=0),
    type: MovementType = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    q: Optional[str] = Query(None, max_length=80),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    user=Depends(current_user),
):
    where_sql, params = _filters(product_id, type, date_from, date_to, q)
    with db.transaction() as cur:
        cur.execute(
            "SELECT COUNT(*) AS n FROM stock_movements m JOIN products p ON p.id = m.product_id" + where_sql,
            params,
        )
        total = cur.fetchone()["n"]
        cur.execute(
            MOVEMENT_SELECT + where_sql + " ORDER BY m.created_at DESC, m.id DESC LIMIT %s OFFSET %s",
            params + [page_size, (page - 1) * page_size],
        )
        items = cur.fetchall()
    return paged(items, total, page, page_size)


@router.get("/movements/export.csv")
def export_movements(
    product_id: Optional[int] = Query(None, gt=0),
    type: MovementType = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    q: Optional[str] = Query(None, max_length=80),
    user=Depends(current_user),
):
    where_sql, params = _filters(product_id, type, date_from, date_to, q)
    rows = db.fetch_all(
        "SELECT to_char(x.created_at AT TIME ZONE %s, 'YYYY-MM-DD HH24:MI') AS local_time, x.* FROM ("
        + MOVEMENT_SELECT + where_sql + " ORDER BY m.created_at DESC, m.id DESC LIMIT 10000) x",
        [config.APP_TIMEZONE] + params,
    )
    header = ["Date and time", "Type", "SKU", "Product", "Quantity", "Balance after", "Unit cost",
              "Reference", "Reason", "Note", "Supplier", "Recorded by"]
    body = [
        [r["local_time"], r["movement_type"], r["sku"], csv_text(r["product_name"]), r["quantity"],
         r["balance_after"], r["unit_cost"], csv_text(r["reference"] or ""), r["reason"] or "",
         csv_text(r["note"] or ""), csv_text(r["supplier_name"] or ""), csv_text(r["user_name"] or "")]
        for r in rows
    ]
    return csv_response("godown-stock-ledger.csv", header, body)
