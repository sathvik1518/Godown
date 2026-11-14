"""User accounts (admin only). There is no public sign-up: an admin creates accounts."""
from fastapi import APIRouter, Depends

import db
import security
from deps import require_admin
from errors import ApiError
from schemas import UserCreate, UserUpdate

router = APIRouter(prefix="/users", tags=["Users"])

COLUMNS = "id, name, email, role, is_active, created_at"


@router.get("")
def list_users(admin=Depends(require_admin)):
    return db.fetch_all(f"SELECT {COLUMNS} FROM users ORDER BY is_active DESC, lower(name)")


@router.post("", status_code=201)
def create_user(body: UserCreate, admin=Depends(require_admin)):
    return db.fetch_one(
        f"""INSERT INTO users (name, email, password_hash, role)
            VALUES (%s, %s, %s, %s) RETURNING {COLUMNS}""",
        (body.name, body.email, security.hash_password(body.password), body.role),
    )


@router.patch("/{user_id}")
def update_user(user_id: int, body: UserUpdate, admin=Depends(require_admin)):
    changes = body.model_dump(exclude_unset=True)
    if user_id == admin["id"] and (
        changes.get("is_active") is False or ("role" in changes and changes["role"] != "admin")
    ):
        raise ApiError(409, "You cannot deactivate yourself or remove your own admin role.", code="self_change")

    sets, params = [], []
    for column in ("name", "role", "is_active"):
        if column in changes:
            sets.append(f"{column} = %s")
            params.append(changes[column])
    if "password" in changes:
        sets.append("password_hash = %s")
        params.append(security.hash_password(changes["password"]))
    params.append(user_id)
    row = db.fetch_one(f"UPDATE users SET {', '.join(sets)} WHERE id = %s RETURNING {COLUMNS}", params)
    if not row:
        raise ApiError(404, "User not found.", code="not_found")
    return row
