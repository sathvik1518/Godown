"""Test setup.

The tests EMPTY every table before each test, so they only ever run against a
separate database (godown_test), never the one you use for development.
"""
import os

import pytest

if os.getenv("DATABASE_URL"):
    pytest.exit(
        "Tests empty the tables, so they will not run while DATABASE_URL is set. "
        "Clear it first (PowerShell: $env:DATABASE_URL='').",
        returncode=2,
    )

os.environ["DB_NAME"] = os.getenv("TEST_DB_NAME", "godown_test")
os.environ["BCRYPT_ROUNDS"] = "4"
os.environ["JWT_SECRET"] = "test-secret-that-is-long-enough-for-hs256-checks"

import psycopg2  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import db  # noqa: E402
import migrate  # noqa: E402
import security  # noqa: E402

TABLES = (
    "stock_movements, purchase_order_items, purchase_orders, products, suppliers, categories, users"
)


def _create_test_database():
    name = os.environ["DB_NAME"]
    conn = psycopg2.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("DB_PORT", "5432")),
        user=os.getenv("DB_USER", "postgres"),
        password=os.getenv("DB_PASSWORD", ""),
        dbname="postgres",
    )
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (name,))
    if not cur.fetchone():
        cur.execute(f'CREATE DATABASE "{name}"')
    conn.close()


@pytest.fixture(scope="session", autouse=True)
def database():
    _create_test_database()
    migrate.run_migrations()


@pytest.fixture(autouse=True)
def clean_database(database):
    from routers import auth

    auth.FAILED_LOGINS.clear()
    with db.transaction() as cur:
        cur.execute(f"TRUNCATE {TABLES} RESTART IDENTITY CASCADE")
        cur.execute("ALTER SEQUENCE po_number_seq RESTART WITH 1")


@pytest.fixture
def app():
    import main

    return main.app


@pytest.fixture
def client(app):
    return TestClient(app)


def _make_user(name, email, role, password="Passw0rd!"):
    return db.fetch_one(
        "INSERT INTO users (name, email, password_hash, role) VALUES (%s, %s, %s, %s) RETURNING *",
        (name, email, security.hash_password(password), role),
    )


def _headers(user):
    return {"Authorization": f"Bearer {security.create_token(user['id'], user['role'])}"}


@pytest.fixture
def admin():
    return _make_user("Sathvik", "saisathvik@gmail.com", "admin")


@pytest.fixture
def staff():
    return _make_user("Kavya Reddy", "kavya.reddy@gmail.com", "staff")


@pytest.fixture
def admin_h(admin):
    return _headers(admin)


@pytest.fixture
def staff_h(staff):
    return _headers(staff)


@pytest.fixture
def make_category(client, admin_h):
    counter = {"n": 0}

    def make(name=None):
        counter["n"] += 1
        r = client.post("/categories", json={"name": name or f"Category {counter['n']}"}, headers=admin_h)
        assert r.status_code == 201, r.text
        return r.json()

    return make


@pytest.fixture
def make_supplier(client, admin_h):
    counter = {"n": 0}

    def make(**overrides):
        counter["n"] += 1
        body = {"name": f"Supplier {counter['n']}"} | overrides
        r = client.post("/suppliers", json=body, headers=admin_h)
        assert r.status_code == 201, r.text
        return r.json()

    return make


@pytest.fixture
def category(make_category):
    return make_category("Staples")


@pytest.fixture
def supplier(make_supplier):
    return make_supplier(name="Sri Venkateswara Traders")


@pytest.fixture
def make_product(client, admin_h, category):
    counter = {"n": 0}

    def make(**overrides):
        counter["n"] += 1
        body = {
            "sku": f"SKU-{counter['n']:03d}",
            "name": f"Product {counter['n']}",
            "category_id": category["id"],
            "cost_price": "100.00",
            "sell_price": "120.00",
            "reorder_level": 5,
        } | overrides
        r = client.post("/products", json=body, headers=admin_h)
        assert r.status_code == 201, r.text
        return r.json()

    return make


def qty_of(product_id):
    return db.fetch_one("SELECT qty_on_hand FROM products WHERE id = %s", (product_id,))["qty_on_hand"]


def ledger_count(product_id=None):
    if product_id:
        row = db.fetch_one("SELECT COUNT(*) AS n FROM stock_movements WHERE product_id = %s", (product_id,))
    else:
        row = db.fetch_one("SELECT COUNT(*) AS n FROM stock_movements")
    return row["n"]
