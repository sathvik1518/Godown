"""Sign in, who am I, change password."""
import time
from collections import defaultdict

from fastapi import APIRouter, Depends

import db
import security
from deps import current_user
from errors import ApiError
from schemas import LoginIn, PasswordChangeIn

router = APIRouter(prefix="/auth", tags=["Auth"])

# Login lockout: 5 wrong passwords for one email blocks it for 5 minutes.
# Kept in memory, so it is per server instance (fine for a small deployment).
MAX_FAILS = 5
WINDOW_SECONDS = 300
FAILED_LOGINS = defaultdict(list)


def _seconds_blocked(email):
    now = time.time()
    FAILED_LOGINS[email] = [t for t in FAILED_LOGINS[email] if now - t < WINDOW_SECONDS]
    if len(FAILED_LOGINS[email]) >= MAX_FAILS:
        return int(WINDOW_SECONDS - (now - FAILED_LOGINS[email][0])) + 1
    return 0


def public_user(row):
    return {k: row[k] for k in ("id", "name", "email", "role")}


@router.post("/login")
def login(body: LoginIn):
    wait = _seconds_blocked(body.email)
    if wait:
        minutes = max(1, round(wait / 60))
        raise ApiError(
            429,
            f"Too many failed attempts. Try again in about {minutes} minute(s).",
            code="too_many_attempts",
            retry_after=wait,
        )

    user = db.fetch_one("SELECT * FROM users WHERE lower(email) = %s", (body.email,))
    ok = security.verify_password(body.password, user["password_hash"] if user else security.DUMMY_HASH)
    if not user or not ok or not user["is_active"]:
        FAILED_LOGINS[body.email].append(time.time())
        raise ApiError(401, "Incorrect email or password.", code="invalid_credentials")

    FAILED_LOGINS.pop(body.email, None)
    return {
        "access_token": security.create_token(user["id"], user["role"]),
        "token_type": "bearer",
        "user": public_user(user),
    }


@router.get("/me")
def me(user=Depends(current_user)):
    return public_user(user)


@router.post("/change-password")
def change_password(body: PasswordChangeIn, user=Depends(current_user)):
    row = db.fetch_one("SELECT password_hash FROM users WHERE id = %s", (user["id"],))
    if not security.verify_password(body.current_password, row["password_hash"]):
        raise ApiError(
            422, "Current password is incorrect.", code="invalid_credentials",
            errors={"current_password": "Current password is incorrect."},
        )
    if body.current_password == body.new_password:
        raise ApiError(
            422, "Choose a password you have not used just now.",
            errors={"new_password": "New password must be different."},
        )
    db.execute(
        "UPDATE users SET password_hash = %s WHERE id = %s",
        (security.hash_password(body.new_password), user["id"]),
    )
    return {"ok": True}
