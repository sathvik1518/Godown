"""Dashboard numbers, demo data integrity and error handling."""
from datetime import datetime, timedelta, timezone

import pytest

import db
import seed
from conftest import qty_of


# --------------------------------------------------------------- dashboard
def test_dashboard_requires_sign_in(client):
    assert client.get("/dashboard").status_code == 401


def test_dashboard_numbers_add_up(client, admin_h, make_product, supplier):
    make_product(sku="H-1", opening_stock=50, reorder_level=10, cost_price="20.00")   # ok, value 1000
    make_product(sku="L-1", opening_stock=4, reorder_level=10, cost_price="50.00")    # low, value 200
    make_product(sku="O-1", reorder_level=5)                                          # out
    gone = make_product(sku="G-1", opening_stock=9, cost_price="10.00")
    client.patch(f"/products/{gone['id']}", json={"is_active": False}, headers=admin_h)

    d = client.get("/dashboard", headers=admin_h).json()
    k = d["kpis"]
    assert k["total_products"] == 3 and k["units_on_hand"] == 54 and float(k["stock_value"]) == 1200.0
    assert k["low_stock"] == 1 and k["out_of_stock"] == 1 and k["archived"] == 1
    assert d["moved_today"]["units_in"] == 63 and d["moved_today"]["units_out"] == 0  # archived stock was received too
    assert [p["sku"] for p in d["low_stock"]] == ["O-1", "L-1"]  # out of stock comes first
    assert d["low_stock"][1]["suggested_qty"] == 16 and d["low_stock"][0]["stock_status"] == "out"


def test_dashboard_trend_covers_fourteen_days_ending_today(client, admin_h, make_product):
    p = make_product(opening_stock=30)
    client.post("/stock/issues", json={"product_id": p["id"], "quantity": 12}, headers=admin_h)
    d = client.get("/dashboard", headers=admin_h).json()
    assert len(d["trend"]) == 14
    assert d["trend"][-1]["day"] == d["today"]
    assert d["trend"][-1]["units_in"] == 30 and d["trend"][-1]["units_out"] == 12
    assert all(day["units_in"] == 0 for day in d["trend"][:-1])
    assert len(d["recent_movements"]) == 2 and d["recent_movements"][0]["movement_type"] == "issue"


def test_dashboard_shows_open_orders_and_stock_on_order(client, admin_h, supplier, make_product):
    p = make_product(reorder_level=10, opening_stock=2)
    po = client.post("/purchase-orders", json={"supplier_id": supplier["id"], "items": [
        {"product_id": p["id"], "quantity": 20, "unit_cost": "10"}]}, headers=admin_h).json()
    client.post(f"/purchase-orders/{po['id']}/order", headers=admin_h)
    d = client.get("/dashboard", headers=admin_h).json()
    assert d["order_counts"] == {"draft": 0, "ordered": 1}
    assert d["open_orders"][0]["po_number"] == po["po_number"] and float(d["open_orders"][0]["total_amount"]) == 200.0
    assert d["low_stock"][0]["on_order"] == 20


def test_category_value_breakdown(client, admin_h, make_category, make_product):
    rice = make_category("Rice")
    make_product(category_id=rice["id"], opening_stock=10, cost_price="30.00")
    names = {c["name"]: float(c["value"]) for c in client.get("/dashboard", headers=admin_h).json()["categories"]}
    assert names["Rice"] == 300.0


# --------------------------------------------------------------- demo data
@pytest.fixture
def seeded():
    return seed.reset()


def test_bootstrap_seeds_an_empty_database_once(clean_database):
    assert seed.bootstrap() == "seeded"
    assert seed.bootstrap() == "existing"
    assert db.fetch_one("SELECT COUNT(*) AS n FROM users")["n"] == 3


def test_seed_can_start_with_only_an_admin(clean_database, monkeypatch):
    monkeypatch.setenv("SEED_DEMO", "0")
    assert seed.bootstrap() == "admin-only"
    assert db.fetch_one("SELECT COUNT(*) AS n FROM products")["n"] == 0
    assert db.fetch_one("SELECT role FROM users")["role"] == "admin"


def test_seeded_ledger_adds_up_to_stock_on_hand(seeded):
    bad = db.fetch_all(
        """SELECT p.sku FROM products p
            WHERE p.qty_on_hand <> COALESCE((SELECT SUM(quantity) FROM stock_movements m WHERE m.product_id = p.id), 0)"""
    )
    assert bad == []
    last = db.fetch_all(
        """SELECT DISTINCT ON (product_id) product_id, balance_after FROM stock_movements
            ORDER BY product_id, created_at DESC, id DESC"""
    )
    assert all(qty_of(row["product_id"]) == row["balance_after"] for row in last)


def test_seeded_balances_never_go_negative_and_chain_correctly(seeded):
    rows = db.fetch_all(
        """SELECT product_id, quantity, balance_after,
                  LAG(balance_after, 1, 0) OVER (PARTITION BY product_id ORDER BY created_at, id) AS previous
             FROM stock_movements"""
    )
    assert len(rows) > 1000
    assert all(r["balance_after"] >= 0 for r in rows)
    assert all(r["previous"] + r["quantity"] == r["balance_after"] for r in rows)


def test_seed_has_a_realistic_shape(seeded):
    status = db.fetch_one(
        """SELECT COUNT(*) FILTER (WHERE qty_on_hand = 0) AS out,
                  COUNT(*) FILTER (WHERE qty_on_hand > 0 AND qty_on_hand <= reorder_level) AS low,
                  COUNT(*) AS total FROM products"""
    )
    assert status["out"] == 3 and status["low"] == 5 and status["total"] >= 30
    statuses = {r["status"] for r in db.fetch_all("SELECT status FROM purchase_orders")}
    assert statuses == {"draft", "ordered", "received", "cancelled"}
    newest = db.fetch_one("SELECT MAX(created_at) AS t FROM stock_movements")["t"]
    assert newest <= datetime.now(timezone.utc)
    assert db.fetch_one("SELECT nextval('po_number_seq') AS n")["n"] == 5


def test_demo_accounts_can_sign_in(client, seeded):
    for email, password, role in [("saisathvik@gmail.com", "Admin@123", "admin"),
                                  ("kavya.reddy@gmail.com", "Staff@1234", "staff")]:
        r = client.post("/auth/login", json={"email": email, "password": password})
        assert r.status_code == 200 and r.json()["user"]["role"] == role


def test_seeded_dashboard_has_alerts_and_history(client, seeded):
    token = client.post("/auth/login", json={"email": "saisathvik@gmail.com", "password": "Admin@123"}).json()
    d = client.get("/dashboard", headers={"Authorization": f"Bearer {token['access_token']}"}).json()
    assert d["kpis"]["low_stock"] == 5 and d["kpis"]["out_of_stock"] == 3
    assert sum(day["units_out"] for day in d["trend"]) > 100
    assert len(d["categories"]) == 6


# ------------------------------------------------------------------ errors
def test_unknown_route_is_a_json_404(client):
    r = client.get("/nope")
    assert r.status_code == 404 and "detail" in r.json()


def test_validation_errors_use_one_shape(client, admin_h):
    r = client.post("/categories", json={"name": "x", "colour": "red"}, headers=admin_h)
    assert r.status_code == 422
    body = r.json()
    assert body["code"] == "validation_error" and set(body["errors"]) == {"name", "colour"}
    assert body["errors"]["name"] == "Must be at least 2 characters."


def test_malformed_json_is_a_clean_422(client, admin_h):
    r = client.post("/categories", content="{not json", headers=admin_h | {"Content-Type": "application/json"})
    assert r.status_code == 422


def test_database_outage_returns_503_not_a_crash(client, monkeypatch):
    monkeypatch.setenv("DB_PORT", "1")
    r = client.get("/health")
    assert r.status_code == 503 and r.json()["code"] == "db_unavailable"


def test_health_when_database_is_up(client):
    assert client.get("/health").json() == {"status": "ok", "database": "connected"}
