import db
from conftest import ledger_count, qty_of


def test_create_product_normalises_sku_and_defaults(client, admin_h, category):
    r = client.post(
        "/products",
        json={"sku": "atta-5kg", "name": "  Aashirvaad Atta 5 kg ", "category_id": category["id"],
              "unit": "pack", "cost_price": "232.00", "sell_price": "255", "reorder_level": 20},
        headers=admin_h,
    )
    assert r.status_code == 201
    p = r.json()
    assert p["sku"] == "ATTA-5KG" and p["name"] == "Aashirvaad Atta 5 kg"
    assert p["qty_on_hand"] == 0 and p["stock_status"] == "out" and p["is_active"] is True
    assert p["category_name"] == "Staples"


def test_opening_stock_is_recorded_in_the_ledger(client, admin_h, make_product):
    p = make_product(opening_stock=40, reorder_level=10)
    assert p["qty_on_hand"] == 40 and p["stock_status"] == "ok"
    rows = client.get(f"/movements?product_id={p['id']}", headers=admin_h).json()["items"]
    assert len(rows) == 1
    assert rows[0]["movement_type"] == "receipt" and rows[0]["quantity"] == 40
    assert rows[0]["reason"] == "opening_stock" and rows[0]["balance_after"] == 40


def test_sku_must_be_unique_ignoring_case(client, admin_h, make_product):
    make_product(sku="OIL-1")
    r = client.post("/products", json={"sku": "oil-1", "name": "Oil", "category_id": 1}, headers=admin_h)
    assert r.status_code == 409 and "sku" in r.json()["errors"]


def test_product_validation_reports_every_bad_field(client, admin_h):
    r = client.post(
        "/products",
        json={"sku": "!bad sku", "name": "", "category_id": 0, "cost_price": "-5", "reorder_level": -1,
              "unit": "bucket", "opening_stock": 1.5},
        headers=admin_h,
    )
    assert r.status_code == 422
    assert set(r.json()["errors"]) >= {"sku", "name", "category_id", "cost_price", "reorder_level", "unit",
                                       "opening_stock"}


def test_price_accepts_at_most_two_decimals(client, admin_h, category):
    r = client.post(
        "/products",
        json={"sku": "P-1", "name": "Pen", "category_id": category["id"], "cost_price": "10.555"},
        headers=admin_h,
    )
    assert r.status_code == 422 and "cost_price" in r.json()["errors"]


def test_unknown_category_or_supplier_gets_a_field_error(client, admin_h):
    r = client.post("/products", json={"sku": "P-1", "name": "Pen", "category_id": 999}, headers=admin_h)
    assert r.status_code == 422 and "category_id" in r.json()["errors"]


def test_inactive_supplier_cannot_be_assigned(client, admin_h, category, make_supplier):
    s = make_supplier(is_active=False)
    r = client.post(
        "/products", json={"sku": "P-1", "name": "Pen", "category_id": category["id"], "supplier_id": s["id"]},
        headers=admin_h,
    )
    assert r.status_code == 422 and "supplier_id" in r.json()["errors"]


def test_staff_cannot_create_edit_or_delete_products(client, staff_h, make_product):
    p = make_product()
    assert client.post("/products", json={"sku": "X-1", "name": "Xx", "category_id": 1}, headers=staff_h).status_code == 403
    assert client.patch(f"/products/{p['id']}", json={"name": "Renamed"}, headers=staff_h).status_code == 403
    assert client.delete(f"/products/{p['id']}", headers=staff_h).status_code == 403
    assert client.get(f"/products/{p['id']}", headers=staff_h).status_code == 200


def test_update_changes_only_the_fields_sent(client, admin_h, make_product):
    p = make_product(sku="TEA-1", name="Red Label Tea", reorder_level=5)
    r = client.patch(f"/products/{p['id']}", json={"reorder_level": 12, "location": "D-01"}, headers=admin_h)
    assert r.status_code == 200
    body = r.json()
    assert body["reorder_level"] == 12 and body["location"] == "D-01" and body["name"] == "Red Label Tea"


def test_stock_quantity_cannot_be_edited_through_the_product(client, admin_h, make_product):
    p = make_product(opening_stock=10)
    r = client.patch(f"/products/{p['id']}", json={"qty_on_hand": 999}, headers=admin_h)
    assert r.status_code == 422
    assert qty_of(p["id"]) == 10


def test_required_fields_cannot_be_blanked_on_update(client, admin_h, make_product):
    p = make_product()
    assert client.patch(f"/products/{p['id']}", json={"name": ""}, headers=admin_h).status_code == 422
    assert client.patch(f"/products/{p['id']}", json={}, headers=admin_h).status_code == 422
    assert client.patch("/products/9999", json={"name": "Ghost"}, headers=admin_h).status_code == 404


def test_supplier_can_be_cleared(client, admin_h, supplier, make_product):
    p = make_product(supplier_id=supplier["id"])
    r = client.patch(f"/products/{p['id']}", json={"supplier_id": None}, headers=admin_h)
    assert r.status_code == 200 and r.json()["supplier_id"] is None


def test_list_search_matches_name_or_sku(client, admin_h, make_product):
    make_product(sku="STP-ATA-5", name="Aashirvaad Atta 5 kg")
    make_product(sku="OIL-SUN-1", name="Sunflower Oil 1 L")
    assert [p["sku"] for p in client.get("/products?q=atta", headers=admin_h).json()["items"]] == ["STP-ATA-5"]
    assert [p["sku"] for p in client.get("/products?q=oil-sun", headers=admin_h).json()["items"]] == ["OIL-SUN-1"]
    assert client.get("/products?q=zzz", headers=admin_h).json()["total"] == 0


def test_search_treats_percent_and_underscore_literally(client, admin_h, make_product):
    make_product(sku="A-1", name="Plain Rice")
    assert client.get("/products?q=%25", headers=admin_h).json()["total"] == 0
    assert client.get("/products?q=_", headers=admin_h).json()["total"] == 0


def test_list_filters_by_category_supplier_and_status(client, admin_h, make_category, supplier, make_product):
    other = make_category("Beverages")
    make_product(sku="A-1", opening_stock=50, reorder_level=10)                        # ok
    make_product(sku="A-2", opening_stock=8, reorder_level=10, supplier_id=supplier["id"])  # low
    make_product(sku="B-1", category_id=other["id"], reorder_level=5)                   # out (0 on hand)
    skus = lambda q: sorted(p["sku"] for p in client.get(f"/products?{q}", headers=admin_h).json()["items"])
    assert skus(f"category_id={other['id']}") == ["B-1"]
    assert skus(f"supplier_id={supplier['id']}") == ["A-2"]
    assert skus("status=ok") == ["A-1"]
    assert skus("status=low") == ["A-2"]
    assert skus("status=out") == ["B-1"]
    assert skus("status=alerts") == ["A-2", "B-1"]


def test_sorting_and_pagination(client, admin_h, make_product):
    for i, qty in enumerate([30, 10, 20, 5, 15], start=1):
        make_product(sku=f"S-{i}", opening_stock=qty)
    page1 = client.get("/products?sort=qty&order=desc&page_size=2", headers=admin_h).json()
    assert [p["qty_on_hand"] for p in page1["items"]] == [30, 20]
    assert page1["total"] == 5 and page1["pages"] == 3 and page1["page"] == 1
    page3 = client.get("/products?sort=qty&order=desc&page_size=2&page=3", headers=admin_h).json()
    assert [p["qty_on_hand"] for p in page3["items"]] == [5]


def test_query_parameters_are_validated(client, admin_h):
    assert client.get("/products?page=0", headers=admin_h).status_code == 422
    assert client.get("/products?page_size=1000", headers=admin_h).status_code == 422
    assert client.get("/products?status=nonsense", headers=admin_h).status_code == 422
    assert client.get("/products?sort=password", headers=admin_h).status_code == 422


def test_archiving_hides_the_product_but_keeps_it_findable(client, admin_h, make_product):
    p = make_product(opening_stock=5)
    client.patch(f"/products/{p['id']}", json={"is_active": False}, headers=admin_h)
    assert client.get("/products", headers=admin_h).json()["total"] == 0
    archived = client.get("/products?status=archived", headers=admin_h).json()
    assert archived["total"] == 1 and archived["items"][0]["is_active"] is False


def test_delete_is_blocked_when_there_is_history(client, admin_h, make_product):
    with_history = make_product(opening_stock=5)
    r = client.delete(f"/products/{with_history['id']}", headers=admin_h)
    assert r.status_code == 409 and "Archive" in r.json()["detail"]
    clean = make_product()
    assert client.delete(f"/products/{clean['id']}", headers=admin_h).status_code == 204
    assert client.delete(f"/products/{clean['id']}", headers=admin_h).status_code == 404


def test_detail_includes_days_of_cover(client, admin_h, make_product):
    p = make_product(opening_stock=100)
    client.post("/stock/issues", json={"product_id": p["id"], "quantity": 30}, headers=admin_h)
    detail = client.get(f"/products/{p['id']}", headers=admin_h).json()
    assert detail["issued_30d"] == 30
    assert detail["days_of_cover"] == 70  # 70 left, selling 1 a day
    assert detail["on_order"] == 0 and detail["last_movement_at"]
    assert client.get("/products/9999", headers=admin_h).status_code == 404


def test_summary_counts(client, admin_h, make_product):
    make_product(opening_stock=50, reorder_level=10)
    make_product(opening_stock=3, reorder_level=10)
    make_product(reorder_level=4)
    gone = make_product()
    client.patch(f"/products/{gone['id']}", json={"is_active": False}, headers=admin_h)
    assert client.get("/products/summary", headers=admin_h).json() == {"total": 3, "low": 1, "out": 1, "archived": 1}


def test_csv_export_has_header_bom_and_neutralises_formulas(client, admin_h, make_product):
    make_product(sku="CSV-1", name="=HYPERLINK(\"http://evil\")", opening_stock=2)
    r = client.get("/products/export.csv", headers=admin_h)
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
    assert "attachment" in r.headers["content-disposition"]
    text = r.content.decode("utf-8")
    assert text.startswith("﻿SKU,Name,Category")
    assert "'=HYPERLINK" in text and ",=HYPERLINK" not in text


def test_export_requires_sign_in(client):
    assert client.get("/products/export.csv").status_code == 401


def test_the_database_itself_refuses_negative_stock(make_product):
    p = make_product(opening_stock=5)
    import psycopg2

    try:
        db.execute("UPDATE products SET qty_on_hand = -1 WHERE id = %s", (p["id"],))
    except psycopg2.errors.CheckViolation as exc:
        assert exc.diag.constraint_name == "products_qty_non_negative"
    else:  # pragma: no cover
        raise AssertionError("negative stock was accepted by the database")
    assert qty_of(p["id"]) == 5 and ledger_count(p["id"]) == 1
