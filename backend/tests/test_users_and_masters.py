"""Users, categories and suppliers: role checks, validation, duplicate and in-use rules."""


# ------------------------------------------------------------------ users
def test_only_admin_can_list_users(client, admin_h, staff_h):
    assert client.get("/users", headers=admin_h).status_code == 200
    assert client.get("/users", headers=staff_h).status_code == 403
    assert client.get("/users").status_code == 401


def test_admin_creates_user_and_duplicate_email_is_rejected(client, admin_h):
    body = {"name": "Ramesh Yadav", "email": "ramesh.yadav@gmail.com", "password": "Staff@1234"}
    r = client.post("/users", json=body, headers=admin_h)
    assert r.status_code == 201 and r.json()["role"] == "staff"
    assert "password" not in r.json() and "password_hash" not in r.json()
    dup = client.post("/users", json=body | {"email": "RAMESH.YADAV@gmail.com"}, headers=admin_h)
    assert dup.status_code == 409 and "email" in dup.json()["errors"]


def test_new_user_password_must_be_strong(client, admin_h):
    r = client.post(
        "/users", json={"name": "Ravi Teja", "email": "ravi@gmail.com", "password": "short"}, headers=admin_h
    )
    assert r.status_code == 422 and "password" in r.json()["errors"]


def test_admin_cannot_demote_or_deactivate_themselves(client, admin, admin_h):
    assert client.patch(f"/users/{admin['id']}", json={"is_active": False}, headers=admin_h).status_code == 409
    assert client.patch(f"/users/{admin['id']}", json={"role": "staff"}, headers=admin_h).status_code == 409


def test_admin_updates_another_user(client, staff, admin_h):
    r = client.patch(f"/users/{staff['id']}", json={"role": "admin", "name": "Kavya R"}, headers=admin_h)
    assert r.status_code == 200 and r.json()["role"] == "admin" and r.json()["name"] == "Kavya R"
    assert client.patch("/users/9999", json={"name": "Nobody"}, headers=admin_h).status_code == 404
    assert client.patch(f"/users/{staff['id']}", json={}, headers=admin_h).status_code == 422


# ------------------------------------------------------------- categories
def test_category_names_are_unique_ignoring_case(client, admin_h):
    assert client.post("/categories", json={"name": "Beverages"}, headers=admin_h).status_code == 201
    dup = client.post("/categories", json={"name": "beverages"}, headers=admin_h)
    assert dup.status_code == 409 and "name" in dup.json()["errors"]


def test_staff_can_read_but_not_change_categories(client, staff_h, make_category):
    category = make_category("Oils")
    assert client.get("/categories", headers=staff_h).status_code == 200
    assert client.post("/categories", json={"name": "Snacks"}, headers=staff_h).status_code == 403
    assert client.put(f"/categories/{category['id']}", json={"name": "X Oils"}, headers=staff_h).status_code == 403
    assert client.delete(f"/categories/{category['id']}", headers=staff_h).status_code == 403


def test_category_update_and_delete_rules(client, admin_h, make_category, make_product):
    used = make_category("Used")
    make_product(category_id=used["id"])
    blocked = client.delete(f"/categories/{used['id']}", headers=admin_h)
    assert blocked.status_code == 409 and "1 product" in blocked.json()["detail"]

    empty = make_category("Empty")
    renamed = client.put(f"/categories/{empty['id']}", json={"name": "Empty 2", "description": "x"}, headers=admin_h)
    assert renamed.status_code == 200 and renamed.json()["name"] == "Empty 2"
    assert client.delete(f"/categories/{empty['id']}", headers=admin_h).status_code == 204
    assert client.delete(f"/categories/{empty['id']}", headers=admin_h).status_code == 404


def test_category_list_counts_active_products(client, admin_h, category, make_product):
    make_product()
    archived = make_product()
    client.patch(f"/products/{archived['id']}", json={"is_active": False}, headers=admin_h)
    listed = client.get("/categories", headers=admin_h).json()
    assert listed[0]["product_count"] == 1


# -------------------------------------------------------------- suppliers
def test_create_supplier_normalises_gstin_and_trims(client, admin_h):
    r = client.post(
        "/suppliers",
        json={"name": "  Balaji Wholesale Mart ", "gstin": "36bhrpb7392k1z4", "phone": "+91 99890 45612",
              "email": "Balaji@Gmail.com"},
        headers=admin_h,
    )
    assert r.status_code == 201
    body = r.json()
    assert body["name"] == "Balaji Wholesale Mart"
    assert body["gstin"] == "36BHRPB7392K1Z4" and body["email"] == "balaji@gmail.com"
    assert body["product_count"] == 0 and body["is_active"] is True


def test_supplier_validation_messages(client, admin_h):
    r = client.post(
        "/suppliers",
        json={"name": "A", "gstin": "12345", "phone": "abc", "email": "nope"},
        headers=admin_h,
    )
    assert r.status_code == 422
    assert set(r.json()["errors"]) == {"name", "gstin", "phone", "email"}


def test_supplier_name_must_be_unique(client, admin_h, supplier):
    r = client.post("/suppliers", json={"name": "sri venkateswara traders"}, headers=admin_h)
    assert r.status_code == 409 and "name" in r.json()["errors"]


def test_supplier_filters_and_deactivation(client, admin_h, staff_h, make_supplier):
    a = make_supplier(name="Ganesh Agencies")
    make_supplier(name="Hanuman Provisions")
    client.put(f"/suppliers/{a['id']}", json={"name": "Ganesh Agencies", "is_active": False}, headers=admin_h)
    assert [s["name"] for s in client.get("/suppliers?status=inactive", headers=staff_h).json()] == ["Ganesh Agencies"]
    assert [s["name"] for s in client.get("/suppliers?q=hanuman", headers=staff_h).json()] == ["Hanuman Provisions"]
    assert len(client.get("/suppliers", headers=staff_h).json()) == 2


def test_supplier_with_products_cannot_be_deleted(client, admin_h, supplier, make_product, make_supplier):
    make_product(supplier_id=supplier["id"])
    r = client.delete(f"/suppliers/{supplier['id']}", headers=admin_h)
    assert r.status_code == 409 and "Deactivate" in r.json()["detail"]
    unused = make_supplier(name="Unused Agency")
    assert client.delete(f"/suppliers/{unused['id']}", headers=admin_h).status_code == 204


def test_staff_cannot_change_suppliers(client, staff_h, supplier):
    assert client.post("/suppliers", json={"name": "New Agency"}, headers=staff_h).status_code == 403
    assert client.put(f"/suppliers/{supplier['id']}", json={"name": "Renamed"}, headers=staff_h).status_code == 403
    assert client.get(f"/suppliers/{supplier['id']}", headers=staff_h).status_code == 200
    assert client.get("/suppliers/9999", headers=staff_h).status_code == 404
