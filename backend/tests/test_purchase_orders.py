import db
from conftest import ledger_count, qty_of


def line(product, quantity=10, unit_cost="100.00"):
    return {"product_id": product["id"], "quantity": quantity, "unit_cost": unit_cost}


def create_po(client, headers, supplier, items, **extra):
    r = client.post("/purchase-orders", json={"supplier_id": supplier["id"], "items": items} | extra, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def test_create_draft_order_with_totals_and_number(client, staff_h, supplier, make_product):
    a, b = make_product(), make_product()
    po = create_po(client, staff_h, supplier, [line(a, 10, "100.00"), line(b, 5, "40.50")],
                   expected_date="2026-12-01", notes="Deliver before Saturday")
    assert po["status"] == "draft" and po["po_number"].endswith("-0001")
    assert po["po_number"].startswith("PO-")
    assert po["item_count"] == 2 and po["total_units"] == 15 and float(po["total_amount"]) == 1202.5
    assert po["supplier_name"] == "Sri Venkateswara Traders" and po["created_by_name"] == "Kavya Reddy"
    assert [i["quantity"] for i in po["items"]] == [10, 5]
    second = create_po(client, staff_h, supplier, [line(a)])
    assert second["po_number"].endswith("-0002")


def test_order_validation(client, admin_h, supplier, make_product):
    p = make_product()
    empty = client.post("/purchase-orders", json={"supplier_id": supplier["id"], "items": []}, headers=admin_h)
    assert empty.status_code == 422
    dup = client.post("/purchase-orders",
                      json={"supplier_id": supplier["id"], "items": [line(p), line(p, 3)]}, headers=admin_h)
    assert dup.status_code == 422
    bad = client.post("/purchase-orders",
                      json={"supplier_id": supplier["id"], "items": [line(p, 0, "-1")]}, headers=admin_h)
    assert bad.status_code == 422
    assert set(bad.json()["errors"]) == {"items.0.quantity", "items.0.unit_cost"}


def test_order_needs_an_active_supplier_and_active_products(client, admin_h, supplier, make_supplier, make_product):
    p = make_product()
    closed = make_supplier(is_active=False)
    r = client.post("/purchase-orders", json={"supplier_id": closed["id"], "items": [line(p)]}, headers=admin_h)
    assert r.status_code == 422 and "supplier_id" in r.json()["errors"]
    client.patch(f"/products/{p['id']}", json={"is_active": False}, headers=admin_h)
    r = client.post("/purchase-orders", json={"supplier_id": supplier["id"], "items": [line(p)]}, headers=admin_h)
    assert r.status_code == 422 and "items.0.product_id" in r.json()["errors"]
    r = client.post("/purchase-orders",
                    json={"supplier_id": supplier["id"], "items": [{"product_id": 999, "quantity": 1, "unit_cost": "1"}]},
                    headers=admin_h)
    assert r.status_code == 422


def test_draft_can_be_edited_but_a_placed_order_cannot(client, admin_h, staff_h, supplier, make_product):
    a, b = make_product(), make_product()
    po = create_po(client, staff_h, supplier, [line(a, 10)])
    r = client.put(f"/purchase-orders/{po['id']}",
                   json={"supplier_id": supplier["id"], "notes": "updated", "items": [line(b, 7, "55.00")]},
                   headers=staff_h)
    assert r.status_code == 200
    assert [i["product_id"] for i in r.json()["items"]] == [b["id"]] and r.json()["notes"] == "updated"
    client.post(f"/purchase-orders/{po['id']}/order", headers=admin_h)
    again = client.put(f"/purchase-orders/{po['id']}",
                       json={"supplier_id": supplier["id"], "items": [line(a)]}, headers=staff_h)
    assert again.status_code == 409 and again.json()["code"] == "not_draft"


def test_only_admin_can_place_or_cancel_orders(client, admin_h, staff_h, supplier, make_product):
    po = create_po(client, staff_h, supplier, [line(make_product())])
    assert client.post(f"/purchase-orders/{po['id']}/order", headers=staff_h).status_code == 403
    assert client.post(f"/purchase-orders/{po['id']}/cancel", headers=staff_h).status_code == 403
    placed = client.post(f"/purchase-orders/{po['id']}/order", headers=admin_h)
    assert placed.status_code == 200 and placed.json()["status"] == "ordered" and placed.json()["ordered_at"]


def test_order_cannot_be_received_before_it_is_placed(client, staff_h, supplier, make_product):
    p = make_product()
    po = create_po(client, staff_h, supplier, [line(p, 10)])
    r = client.post(f"/purchase-orders/{po['id']}/receive", headers=staff_h)
    assert r.status_code == 409 and r.json()["code"] == "bad_status"
    assert qty_of(p["id"]) == 0


def test_receiving_posts_every_line_to_the_ledger(client, admin_h, staff_h, supplier, make_product):
    a = make_product(opening_stock=5, cost_price="100.00")
    b = make_product()
    po = create_po(client, staff_h, supplier, [line(a, 20, "110.00"), line(b, 8, "40.00")])
    client.post(f"/purchase-orders/{po['id']}/order", headers=admin_h)
    r = client.post(f"/purchase-orders/{po['id']}/receive", headers=staff_h)
    assert r.status_code == 200 and r.json()["status"] == "received" and r.json()["received_at"]
    assert qty_of(a["id"]) == 25 and qty_of(b["id"]) == 8
    rows = client.get(f"/movements?q={po['po_number']}", headers=admin_h).json()["items"]
    assert len(rows) == 2 and all(m["movement_type"] == "receipt" for m in rows)
    assert all(m["purchase_order_id"] == po["id"] and m["supplier_name"] for m in rows)
    assert float(client.get(f"/products/{a['id']}", headers=admin_h).json()["cost_price"]) == 110.0


def test_receiving_twice_does_not_double_the_stock(client, admin_h, staff_h, supplier, make_product):
    p = make_product()
    po = create_po(client, staff_h, supplier, [line(p, 10)])
    client.post(f"/purchase-orders/{po['id']}/order", headers=admin_h)
    assert client.post(f"/purchase-orders/{po['id']}/receive", headers=staff_h).status_code == 200
    assert client.post(f"/purchase-orders/{po['id']}/receive", headers=staff_h).status_code == 409
    assert qty_of(p["id"]) == 10 and ledger_count(p["id"]) == 1


def test_a_failed_receipt_changes_nothing(client, admin_h, staff_h, supplier, make_product):
    """If one line cannot be received, no line is received and the order stays open."""
    a, b = make_product(), make_product()
    po = create_po(client, staff_h, supplier, [line(a, 10), line(b, 10)])
    client.post(f"/purchase-orders/{po['id']}/order", headers=admin_h)
    client.patch(f"/products/{b['id']}", json={"is_active": False}, headers=admin_h)  # archived after ordering
    r = client.post(f"/purchase-orders/{po['id']}/receive", headers=staff_h)
    assert r.status_code == 409
    assert qty_of(a["id"]) == 0 and qty_of(b["id"]) == 0 and ledger_count() == 0
    assert client.get(f"/purchase-orders/{po['id']}", headers=admin_h).json()["status"] == "ordered"


def test_cancel_rules(client, admin_h, staff_h, supplier, make_product):
    p = make_product()
    draft = create_po(client, staff_h, supplier, [line(p)])
    assert client.post(f"/purchase-orders/{draft['id']}/cancel", headers=admin_h).json()["status"] == "cancelled"
    assert client.post(f"/purchase-orders/{draft['id']}/cancel", headers=admin_h).status_code == 409
    assert client.post(f"/purchase-orders/{draft['id']}/order", headers=admin_h).status_code == 409

    done = create_po(client, staff_h, supplier, [line(p)])
    client.post(f"/purchase-orders/{done['id']}/order", headers=admin_h)
    client.post(f"/purchase-orders/{done['id']}/receive", headers=staff_h)
    assert client.post(f"/purchase-orders/{done['id']}/cancel", headers=admin_h).status_code == 409
    assert client.get("/purchase-orders/9999", headers=admin_h).status_code == 404


def test_order_list_filters(client, admin_h, staff_h, supplier, make_supplier, make_product):
    other = make_supplier(name="Ganesh Agencies")
    p = make_product()
    a = create_po(client, staff_h, supplier, [line(p)])
    b = create_po(client, staff_h, other, [line(p)])
    client.post(f"/purchase-orders/{b['id']}/order", headers=admin_h)
    c = create_po(client, staff_h, supplier, [line(p)])
    client.post(f"/purchase-orders/{c['id']}/cancel", headers=admin_h)

    def numbers(q):
        return sorted(o["po_number"][-4:] for o in client.get(f"/purchase-orders?{q}", headers=admin_h).json()["items"])

    assert numbers("") == ["0001", "0002", "0003"]
    assert numbers("status=open") == ["0001", "0002"]
    assert numbers("status=ordered") == ["0002"] and numbers("status=cancelled") == ["0003"]
    assert numbers(f"supplier_id={other['id']}") == ["0002"]
    assert numbers("q=ganesh") == ["0002"]
    assert a["po_number"] in client.get(f"/purchase-orders?q={a['po_number']}", headers=admin_h).text


def test_low_stock_suggestions_make_one_draft_per_supplier(client, staff_h, supplier, make_supplier, make_product):
    other = make_supplier(name="Balaji Wholesale Mart")
    low_a = make_product(reorder_level=10, opening_stock=4, cost_price="50.00", supplier_id=supplier["id"])
    low_b = make_product(reorder_level=6, supplier_id=other["id"])                      # out of stock
    make_product(reorder_level=10, opening_stock=3)                                       # low, no supplier
    make_product(reorder_level=10, opening_stock=100, supplier_id=supplier["id"])         # healthy
    r = client.post("/purchase-orders/from-low-stock", headers=staff_h)
    assert r.status_code == 201
    body = r.json()
    assert len(body["created"]) == 2 and body["skipped_no_supplier"] == 1 and body["skipped_already_ordered"] == 0
    full = {o["supplier_name"]: client.get(f"/purchase-orders/{o['id']}", headers=staff_h).json() for o in body["created"]}
    first = full["Sri Venkateswara Traders"]["items"][0]
    assert first["product_id"] == low_a["id"] and first["quantity"] == 16  # 2 x reorder level (20) - on hand (4)
    assert full["Balaji Wholesale Mart"]["items"][0]["product_id"] == low_b["id"]
    # running it again must not duplicate orders for products already on an open order
    again = client.post("/purchase-orders/from-low-stock", headers=staff_h).json()
    assert again["created"] == [] and again["skipped_already_ordered"] == 2


def test_on_order_quantity_is_shown_on_the_product(client, admin_h, staff_h, supplier, make_product):
    p = make_product(reorder_level=5)
    po = create_po(client, staff_h, supplier, [line(p, 30)])
    assert client.get(f"/products/{p['id']}", headers=admin_h).json()["on_order"] == 0  # drafts do not count
    client.post(f"/purchase-orders/{po['id']}/order", headers=admin_h)
    assert client.get(f"/products/{p['id']}", headers=admin_h).json()["on_order"] == 30


def test_ordered_products_and_suppliers_cannot_be_deleted(client, admin_h, staff_h, supplier, make_product):
    p = make_product()
    create_po(client, staff_h, supplier, [line(p)])
    assert client.delete(f"/products/{p['id']}", headers=admin_h).status_code == 409
    assert client.delete(f"/suppliers/{supplier['id']}", headers=admin_h).status_code == 409
    assert db.fetch_one("SELECT COUNT(*) AS n FROM purchase_order_items")["n"] == 1
