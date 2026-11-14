"""One call that feeds the whole dashboard."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends

import config
import db
from deps import current_user
from services.stock import MOVEMENT_SELECT

router = APIRouter(tags=["Dashboard"])

TZ = config.APP_TIMEZONE


@router.get("/dashboard")
def dashboard(user=Depends(current_user)):
    with db.transaction() as cur:
        cur.execute(
            """SELECT COUNT(*) FILTER (WHERE is_active) AS total_products,
                      COALESCE(SUM(qty_on_hand) FILTER (WHERE is_active), 0) AS units_on_hand,
                      COALESCE(SUM(qty_on_hand * cost_price) FILTER (WHERE is_active), 0) AS stock_value,
                      COUNT(*) FILTER (WHERE is_active AND qty_on_hand = 0) AS out_of_stock,
                      COUNT(*) FILTER (WHERE is_active AND qty_on_hand > 0
                                       AND qty_on_hand <= reorder_level) AS low_stock,
                      COUNT(*) FILTER (WHERE NOT is_active) AS archived
                 FROM products"""
        )
        kpis = cur.fetchone()

        cur.execute(
            """SELECT COALESCE(SUM(quantity) FILTER (WHERE movement_type = 'receipt'), 0) AS units_in,
                      COALESCE(-SUM(quantity) FILTER (WHERE movement_type = 'issue'), 0) AS units_out,
                      COUNT(*) AS transactions
                 FROM stock_movements
                WHERE (created_at AT TIME ZONE %s)::date = (now() AT TIME ZONE %s)::date""",
            (TZ, TZ),
        )
        today = cur.fetchone()

        cur.execute(
            """WITH days AS (
                   SELECT generate_series((now() AT TIME ZONE %s)::date - 13,
                                          (now() AT TIME ZONE %s)::date, interval '1 day')::date AS day)
               SELECT d.day,
                      COALESCE(SUM(m.quantity) FILTER (WHERE m.movement_type = 'receipt'), 0) AS units_in,
                      COALESCE(-SUM(m.quantity) FILTER (WHERE m.movement_type = 'issue'), 0) AS units_out
                 FROM days d
                 LEFT JOIN stock_movements m ON (m.created_at AT TIME ZONE %s)::date = d.day
                GROUP BY d.day ORDER BY d.day""",
            (TZ, TZ, TZ),
        )
        trend = cur.fetchall()

        cur.execute(
            """SELECT p.id, p.sku, p.name, p.unit, p.qty_on_hand, p.reorder_level, p.cost_price,
                      s.name AS supplier_name,
                      GREATEST(p.reorder_level * 2 - p.qty_on_hand, 1) AS suggested_qty,
                      CASE WHEN p.qty_on_hand = 0 THEN 'out' ELSE 'low' END AS stock_status,
                      COALESCE((SELECT SUM(i.quantity)
                                  FROM purchase_order_items i
                                  JOIN purchase_orders o ON o.id = i.purchase_order_id
                                 WHERE i.product_id = p.id AND o.status = 'ordered'), 0) AS on_order
                 FROM products p LEFT JOIN suppliers s ON s.id = p.supplier_id
                WHERE p.is_active AND p.qty_on_hand <= p.reorder_level
                ORDER BY (p.qty_on_hand = 0) DESC,
                         p.qty_on_hand::numeric / NULLIF(p.reorder_level, 0) ASC NULLS LAST,
                         p.name
                LIMIT 8"""
        )
        low_stock = cur.fetchall()

        cur.execute(MOVEMENT_SELECT + " ORDER BY m.created_at DESC, m.id DESC LIMIT 8")
        recent = cur.fetchall()

        cur.execute(
            """SELECT c.id, c.name, COUNT(p.id) AS products,
                      COALESCE(SUM(p.qty_on_hand), 0) AS units,
                      COALESCE(SUM(p.qty_on_hand * p.cost_price), 0) AS value
                 FROM categories c LEFT JOIN products p ON p.category_id = c.id AND p.is_active
                GROUP BY c.id ORDER BY value DESC, c.name"""
        )
        categories = cur.fetchall()

        cur.execute(
            """SELECT o.id, o.po_number, o.status, o.expected_date, s.name AS supplier_name,
                      COALESCE((SELECT SUM(quantity * unit_cost) FROM purchase_order_items
                                 WHERE purchase_order_id = o.id), 0) AS total_amount
                 FROM purchase_orders o JOIN suppliers s ON s.id = o.supplier_id
                WHERE o.status IN ('draft', 'ordered')
                ORDER BY (o.status = 'ordered') DESC, o.expected_date NULLS LAST, o.id DESC
                LIMIT 5"""
        )
        open_orders = cur.fetchall()

        cur.execute(
            """SELECT COUNT(*) FILTER (WHERE status = 'draft') AS draft,
                      COUNT(*) FILTER (WHERE status = 'ordered') AS ordered
                 FROM purchase_orders"""
        )
        order_counts = cur.fetchone()

        cur.execute("SELECT (now() AT TIME ZONE %s)::date AS today", (TZ,))
        local_today = cur.fetchone()["today"]

    return {
        "generated_at": datetime.now(timezone.utc),
        "today": local_today,
        "kpis": kpis,
        "moved_today": today,
        "trend": trend,
        "low_stock": low_stock,
        "recent_movements": recent,
        "categories": categories,
        "open_orders": open_orders,
        "order_counts": order_counts,
    }
