"""The heart of the app: every stock change goes through post_movement().

It runs inside the caller's transaction and does four things in order:
  1. lock the product row (SELECT ... FOR UPDATE) so two people cannot change it at once
  2. check the rule (an issue can never take stock below zero)
  3. update products.qty_on_hand
  4. append a row to the stock_movements ledger with the balance after the change
If anything fails the whole transaction rolls back, so the balance and the ledger never disagree.
"""
from errors import ApiError

# Shared SELECT used by the ledger list, CSV export and dashboard.
MOVEMENT_SELECT = """
    SELECT m.id, m.created_at, m.movement_type, m.quantity, m.balance_after, m.unit_cost,
           m.reference, m.reason, m.note, m.purchase_order_id,
           p.id AS product_id, p.sku, p.name AS product_name, p.unit,
           s.name AS supplier_name, u.name AS user_name
      FROM stock_movements m
      JOIN products p ON p.id = m.product_id
      LEFT JOIN suppliers s ON s.id = m.supplier_id
      LEFT JOIN users u ON u.id = m.created_by
"""


def stock_status(qty, reorder_level):
    if qty == 0:
        return "out"
    if qty <= reorder_level:
        return "low"
    return "ok"


def post_movement(
    cur,
    *,
    product_id,
    kind,
    user_id,
    quantity=None,
    new_quantity=None,
    supplier_id=None,
    unit_cost=None,
    reference=None,
    reason=None,
    note=None,
    purchase_order_id=None,
):
    cur.execute(
        """SELECT id, sku, name, qty_on_hand, reorder_level, cost_price, is_active
             FROM products WHERE id = %s FOR UPDATE""",
        (product_id,),
    )
    product = cur.fetchone()
    if not product:
        raise ApiError(404, "Product not found.", code="product_not_found")
    if not product["is_active"]:
        raise ApiError(
            409, f"{product['name']} is archived. Restore it before recording stock.", code="product_archived"
        )

    on_hand = product["qty_on_hand"]
    if kind == "receipt":
        delta = quantity
    elif kind == "issue":
        if quantity > on_hand:
            raise ApiError(
                409,
                f"Only {on_hand} of {product['name']} in stock. You cannot issue {quantity}.",
                code="insufficient_stock",
                available=on_hand,
                requested=quantity,
            )
        delta = -quantity
    elif kind == "adjustment":
        delta = new_quantity - on_hand
        if delta == 0:
            raise ApiError(
                422, "The counted quantity matches the system quantity, so there is nothing to adjust.",
                code="no_change",
            )
    else:  # pragma: no cover - guarded by the API layer
        raise ValueError(f"unknown movement kind {kind}")

    balance = on_hand + delta
    cost = unit_cost if unit_cost is not None else product["cost_price"]

    if kind == "receipt" and unit_cost is not None:
        # Cost price follows the latest purchase cost.
        cur.execute(
            "UPDATE products SET qty_on_hand = %s, cost_price = %s, updated_at = now() WHERE id = %s",
            (balance, unit_cost, product_id),
        )
    else:
        cur.execute(
            "UPDATE products SET qty_on_hand = %s, updated_at = now() WHERE id = %s",
            (balance, product_id),
        )

    cur.execute(
        """INSERT INTO stock_movements
               (product_id, movement_type, quantity, balance_after, unit_cost, supplier_id,
                reference, reason, note, created_by, purchase_order_id)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
           RETURNING id, created_at""",
        (product_id, kind, delta, balance, cost, supplier_id, reference, reason, note, user_id,
         purchase_order_id),
    )
    row = cur.fetchone()
    return {
        "id": row["id"],
        "created_at": row["created_at"],
        "movement_type": kind,
        "quantity": delta,
        "balance_after": balance,
        "product": {
            "id": product["id"],
            "sku": product["sku"],
            "name": product["name"],
            "qty_on_hand": balance,
            "reorder_level": product["reorder_level"],
            "stock_status": stock_status(balance, product["reorder_level"]),
            "previous_quantity": on_hand,
        },
    }
