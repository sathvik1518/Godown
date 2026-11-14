"""Receipts, issues, adjustments and the ledger: the rules that matter most."""
from concurrent.futures import ThreadPoolExecutor

import psycopg2
import pytest
from fastapi.testclient import TestClient

import db
from conftest import ledger_count, qty_of


def post(client, path, headers, **body):
    return client.post(path, json=body, headers=headers)


# ---------------------------------------------------------------- receipts
def test_receipt_adds_stock_and_writes_a_ledger_row(client, admin_h, make_product, supplier):
    p = make_product(opening_stock=10)
    r = post(client, "/stock/receipts", admin_h, product_id=p["id"], quantity=25, supplier_id=supplier["id"],
             reference="INV-4471", note="Weekly delivery")
    assert r.status_code == 201
    body = r.json()
    assert body["quantity"] == 25 and body["balance_after"] == 35
    assert body["product"]["previous_quantity"] == 10 and body["product"]["qty_on_hand"] == 35
    assert qty_of(p["id"]) == 35
    row = client.get(f"/movements?product_id={p['id']}", headers=admin_h).json()["items"][0]
    assert row["reference"] == "INV-4471" and row["supplier_name"] == "Sri Venkateswara Traders"
    assert row["user_name"] == "Sathvik"


def test_receipt_cost_updates_the_product_cost_price(client, admin_h, make_product):
    p = make_product(cost_price="100.00")
    post(client, "/stock/receipts", admin_h, product_id=p["id"], quantity=5, unit_cost="104.50")
    assert float(client.get(f"/products/{p['id']}", headers=admin_h).json()["cost_price"]) == 104.5


def test_staff_can_record_receipts_and_issues(client, staff_h, make_product):
    p = make_product(opening_stock=10)
    assert post(client, "/stock/receipts", staff_h, product_id=p["id"], quantity=5).status_code == 201
    assert post(client, "/stock/issues", staff_h, product_id=p["id"], quantity=3).status_code == 201
    assert qty_of(p["id"]) == 12


@pytest.mark.parametrize("quantity", [0, -3, 1.5, "abc", 1_000_001])
def test_quantity_must_be_a_positive_whole_number(client, admin_h, make_product, quantity):
    p = make_product(opening_stock=5)
    for path in ("/stock/receipts", "/stock/issues"):
        r = post(client, path, admin_h, product_id=p["id"], quantity=quantity)
        assert r.status_code == 422 and "quantity" in r.json()["errors"]
    assert qty_of(p["id"]) == 5 and ledger_count(p["id"]) == 1


def test_unknown_product_is_a_404(client, admin_h):
    assert post(client, "/stock/receipts", admin_h, product_id=999, quantity=1).status_code == 404
    assert post(client, "/stock/issues", admin_h, product_id=999, quantity=1).status_code == 404


def test_unknown_supplier_on_receipt_gets_a_field_error(client, admin_h, make_product):
    p = make_product()
    r = post(client, "/stock/receipts", admin_h, product_id=p["id"], quantity=1, supplier_id=999)
    assert r.status_code == 422 and "supplier_id" in r.json()["errors"]


def test_requests_with_unexpected_fields_are_rejected(client, admin_h, make_product):
    p = make_product()
    r = post(client, "/stock/receipts", admin_h, product_id=p["id"], quantity=1, balance_after=9999)
    assert r.status_code == 422


# ------------------------------------------------------------------ issues
def test_issue_removes_stock(client, admin_h, make_product):
    p = make_product(opening_stock=20)
    r = post(client, "/stock/issues", admin_h, product_id=p["id"], quantity=7, reason="sale", reference="BILL-001")
    assert r.status_code == 201 and r.json()["quantity"] == -7 and r.json()["balance_after"] == 13
    assert qty_of(p["id"]) == 13


def test_cannot_issue_more_than_is_in_stock(client, admin_h, make_product):
    p = make_product(opening_stock=4)
    r = post(client, "/stock/issues", admin_h, product_id=p["id"], quantity=5)
    assert r.status_code == 409
    body = r.json()
    assert body["code"] == "insufficient_stock" and body["available"] == 4 and body["requested"] == 5
    assert "Only 4" in body["detail"]
    assert qty_of(p["id"]) == 4 and ledger_count(p["id"]) == 1  # nothing changed, nothing logged


def test_can_issue_exactly_everything(client, admin_h, make_product):
    p = make_product(opening_stock=6, reorder_level=2)
    r = post(client, "/stock/issues", admin_h, product_id=p["id"], quantity=6)
    assert r.status_code == 201 and r.json()["product"]["stock_status"] == "out"
    assert post(client, "/stock/issues", admin_h, product_id=p["id"], quantity=1).status_code == 409


def test_issue_reports_when_stock_drops_below_reorder_level(client, admin_h, make_product):
    p = make_product(opening_stock=12, reorder_level=10)
    r = post(client, "/stock/issues", admin_h, product_id=p["id"], quantity=3)
    assert r.json()["product"]["stock_status"] == "low"


def test_issue_reason_must_be_from_the_list(client, admin_h, make_product):
    p = make_product(opening_stock=5)
    assert post(client, "/stock/issues", admin_h, product_id=p["id"], quantity=1, reason="gift").status_code == 422


def test_archived_products_reject_stock_changes(client, admin_h, make_product):
    p = make_product(opening_stock=5)
    client.patch(f"/products/{p['id']}", json={"is_active": False}, headers=admin_h)
    for path in ("/stock/receipts", "/stock/issues"):
        r = post(client, path, admin_h, product_id=p["id"], quantity=1)
        assert r.status_code == 409 and r.json()["code"] == "product_archived"


# ------------------------------------------------------------- adjustments
def test_admin_adjusts_stock_to_the_counted_quantity(client, admin_h, make_product):
    p = make_product(opening_stock=20)
    r = post(client, "/stock/adjustments", admin_h, product_id=p["id"], new_quantity=17,
             reason="stock_count", note="Shelf count: 3 short")
    assert r.status_code == 201 and r.json()["quantity"] == -3 and r.json()["balance_after"] == 17
    r = post(client, "/stock/adjustments", admin_h, product_id=p["id"], new_quantity=25, note="Found a carton")
    assert r.json()["quantity"] == 8 and qty_of(p["id"]) == 25


def test_adjustment_to_the_same_quantity_is_refused(client, admin_h, make_product):
    p = make_product(opening_stock=9)
    r = post(client, "/stock/adjustments", admin_h, product_id=p["id"], new_quantity=9, note="recount")
    assert r.status_code == 422 and r.json()["code"] == "no_change"


def test_adjustment_needs_a_note_and_admin_rights(client, admin_h, staff_h, make_product):
    p = make_product(opening_stock=9)
    assert post(client, "/stock/adjustments", admin_h, product_id=p["id"], new_quantity=5).status_code == 422
    r = post(client, "/stock/adjustments", staff_h, product_id=p["id"], new_quantity=5, note="staff try")
    assert r.status_code == 403 and qty_of(p["id"]) == 9


def test_adjustment_cannot_set_negative_stock(client, admin_h, make_product):
    p = make_product(opening_stock=9)
    r = post(client, "/stock/adjustments", admin_h, product_id=p["id"], new_quantity=-1, note="oops")
    assert r.status_code == 422 and "new_quantity" in r.json()["errors"]


# ------------------------------------------------------------------ ledger
def test_balance_after_is_a_running_total(client, admin_h, make_product):
    p = make_product()
    steps = [("receipts", 50), ("issues", 12), ("issues", 8), ("receipts", 5), ("issues", 20)]
    for path, n in steps:
        assert post(client, f"/stock/{path}", admin_h, product_id=p["id"], quantity=n).status_code == 201
    rows = client.get(f"/movements?product_id={p['id']}", headers=admin_h).json()["items"][::-1]
    assert [r["balance_after"] for r in rows] == [50, 38, 30, 35, 15]
    total = db.fetch_one("SELECT SUM(quantity) AS s FROM stock_movements WHERE product_id = %s", (p["id"],))["s"]
    assert total == qty_of(p["id"]) == 15


def test_ledger_rows_cannot_be_edited_or_deleted(make_product):
    p = make_product(opening_stock=5)
    for sql in ("UPDATE stock_movements SET quantity = 99", "DELETE FROM stock_movements"):
        with pytest.raises(psycopg2.errors.RestrictViolation):
            db.execute(sql)
    assert ledger_count(p["id"]) == 1


def test_ledger_filters(client, admin_h, make_product):
    a = make_product(sku="A-1", name="Atta")
    b = make_product(sku="B-1", name="Biscuits")
    post(client, "/stock/receipts", admin_h, product_id=a["id"], quantity=10, reference="INV-100")
    post(client, "/stock/receipts", admin_h, product_id=b["id"], quantity=10)
    post(client, "/stock/issues", admin_h, product_id=a["id"], quantity=2, note="sold loose")

    def count(q):
        return client.get(f"/movements?{q}", headers=admin_h).json()["total"]

    assert count("") == 3
    assert count(f"product_id={a['id']}") == 2
    assert count("type=issue") == 1 and count("type=receipt") == 2
    assert count("q=inv-100") == 1 and count("q=loose") == 1 and count("q=biscuits") == 1
    assert count("date_from=2999-01-01") == 0
    assert count("date_to=2000-01-01") == 0


def test_ledger_date_range_must_be_in_order(client, admin_h):
    r = client.get("/movements?date_from=2026-11-10&date_to=2026-11-01", headers=admin_h)
    assert r.status_code == 422 and "date_from" in r.json()["errors"]
    assert client.get("/movements?date_from=not-a-date", headers=admin_h).status_code == 422


def test_ledger_is_paginated_newest_first(client, admin_h, make_product):
    p = make_product()
    for n in range(1, 8):
        post(client, "/stock/receipts", admin_h, product_id=p["id"], quantity=n)
    page = client.get("/movements?page_size=3", headers=admin_h).json()
    assert page["total"] == 7 and page["pages"] == 3
    assert [m["quantity"] for m in page["items"]] == [7, 6, 5]


def test_ledger_csv_export(client, admin_h, make_product):
    p = make_product(opening_stock=5)
    post(client, "/stock/issues", admin_h, product_id=p["id"], quantity=2, note="=cmd|' /C calc'!A0")
    r = client.get("/movements/export.csv", headers=admin_h)
    assert r.status_code == 200
    text = r.content.decode("utf-8")
    assert text.startswith("﻿Date and time,Type,SKU")
    assert text.count("\n") >= 3 and "'=cmd" in text


def test_everything_needs_sign_in(client, make_product):
    p = make_product()
    for method, path in [("post", "/stock/receipts"), ("post", "/stock/issues"), ("post", "/stock/adjustments"),
                         ("get", "/movements"), ("get", "/dashboard"), ("get", f"/products/{p['id']}")]:
        assert getattr(client, method)(path).status_code == 401


# ------------------------------------------------------------- concurrency
def test_parallel_issues_can_never_oversell(app, admin_h, make_product):
    """Ten cashiers each try to sell 3 units of a product that has 20.
    Exactly six can succeed (18 units); the other four must be refused."""
    p = make_product(opening_stock=20)

    def attempt(_):
        return TestClient(app).post(
            "/stock/issues", json={"product_id": p["id"], "quantity": 3}, headers=admin_h
        ).status_code

    with ThreadPoolExecutor(max_workers=10) as pool:
        codes = list(pool.map(attempt, range(10)))

    assert sorted(codes) == [201] * 6 + [409] * 4
    assert qty_of(p["id"]) == 2
    total = db.fetch_one("SELECT SUM(quantity) AS s FROM stock_movements WHERE product_id = %s", (p["id"],))["s"]
    assert total == 2
    lowest = db.fetch_one("SELECT MIN(balance_after) AS m FROM stock_movements WHERE product_id = %s", (p["id"],))["m"]
    assert lowest >= 0


def test_parallel_receipts_are_all_counted(app, admin_h, make_product):
    p = make_product()

    def attempt(_):
        return TestClient(app).post(
            "/stock/receipts", json={"product_id": p["id"], "quantity": 5}, headers=admin_h
        ).status_code

    with ThreadPoolExecutor(max_workers=8) as pool:
        codes = list(pool.map(attempt, range(8)))
    assert codes == [201] * 8 and qty_of(p["id"]) == 40
