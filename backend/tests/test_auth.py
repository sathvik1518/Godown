import db
import security


def login(client, email, password):
    return client.post("/auth/login", json={"email": email, "password": password})


def test_login_returns_token_and_user(client, admin):
    r = login(client, "saisathvik@gmail.com", "Passw0rd!")
    assert r.status_code == 200
    body = r.json()
    assert body["token_type"] == "bearer" and body["access_token"]
    assert body["user"] == {"id": admin["id"], "name": "Sathvik", "email": "saisathvik@gmail.com", "role": "admin"}
    assert "password_hash" not in str(body)


def test_login_email_is_case_insensitive(client, admin):
    assert login(client, "SaiSathvik@Gmail.com", "Passw0rd!").status_code == 200


def test_wrong_password_and_unknown_email_look_the_same(client, admin):
    wrong = login(client, "saisathvik@gmail.com", "nope-nope1")
    unknown = login(client, "nobody@gmail.com", "nope-nope1")
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json()["detail"] == unknown.json()["detail"] == "Incorrect email or password."


def test_login_validates_input(client):
    r = client.post("/auth/login", json={"email": "not-an-email", "password": ""})
    assert r.status_code == 422
    assert set(r.json()["errors"]) == {"email", "password"}


def test_account_locks_after_five_wrong_passwords(client, admin):
    for _ in range(5):
        assert login(client, "saisathvik@gmail.com", "wrong-pass1").status_code == 401
    blocked = login(client, "saisathvik@gmail.com", "Passw0rd!")  # even the right password is refused now
    assert blocked.status_code == 429
    assert blocked.json()["code"] == "too_many_attempts"


def test_successful_login_resets_the_failure_counter(client, admin):
    for _ in range(3):
        login(client, "saisathvik@gmail.com", "wrong-pass1")
    assert login(client, "saisathvik@gmail.com", "Passw0rd!").status_code == 200
    for _ in range(3):
        assert login(client, "saisathvik@gmail.com", "wrong-pass1").status_code == 401


def test_deactivated_user_cannot_sign_in(client, admin):
    db.execute("UPDATE users SET is_active = FALSE WHERE id = %s", (admin["id"],))
    assert login(client, "saisathvik@gmail.com", "Passw0rd!").status_code == 401


def test_me_needs_a_valid_token(client, admin_h):
    assert client.get("/auth/me").status_code == 401
    assert client.get("/auth/me", headers={"Authorization": "Bearer garbage"}).status_code == 401
    r = client.get("/auth/me", headers=admin_h)
    assert r.status_code == 200 and r.json()["email"] == "saisathvik@gmail.com"


def test_token_stops_working_when_user_is_deactivated(client, admin, admin_h):
    db.execute("UPDATE users SET is_active = FALSE WHERE id = %s", (admin["id"],))
    assert client.get("/auth/me", headers=admin_h).status_code == 401


def test_role_is_read_from_the_database_not_the_token(client, admin, admin_h):
    db.execute("UPDATE users SET role = 'staff' WHERE id = %s", (admin["id"],))
    assert client.get("/users", headers=admin_h).status_code == 403


def test_change_password(client, admin, admin_h):
    r = client.post(
        "/auth/change-password",
        json={"current_password": "Passw0rd!", "new_password": "Brand-new9"},
        headers=admin_h,
    )
    assert r.status_code == 200
    assert login(client, "saisathvik@gmail.com", "Passw0rd!").status_code == 401
    assert login(client, "saisathvik@gmail.com", "Brand-new9").status_code == 200


def test_change_password_rejects_wrong_current_and_weak_new(client, admin_h):
    wrong = client.post(
        "/auth/change-password",
        json={"current_password": "not-it-1", "new_password": "Brand-new9"},
        headers=admin_h,
    )
    assert wrong.status_code == 422 and "current_password" in wrong.json()["errors"]
    weak = client.post(
        "/auth/change-password",
        json={"current_password": "Passw0rd!", "new_password": "onlyletters"},
        headers=admin_h,
    )
    assert weak.status_code == 422 and "new_password" in weak.json()["errors"]


def test_passwords_are_stored_hashed(admin):
    assert admin["password_hash"] != "Passw0rd!"
    assert security.verify_password("Passw0rd!", admin["password_hash"])
