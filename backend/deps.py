"""Shared FastAPI dependencies: who is calling, and are they allowed."""
import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

import db
import security
from errors import ApiError

bearer = HTTPBearer(auto_error=False)


def current_user(creds: HTTPAuthorizationCredentials = Depends(bearer)):
    """Reads the token, then loads the user fresh from the database so that
    role changes and deactivations take effect immediately."""
    if creds is None:
        raise ApiError(401, "Please sign in to continue.", code="unauthenticated")
    try:
        payload = security.decode_token(creds.credentials)
        user_id = int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise ApiError(401, "Your session has expired. Please sign in again.", code="token_invalid")
    user = db.fetch_one(
        "SELECT id, name, email, role, is_active FROM users WHERE id = %s", (user_id,)
    )
    if not user or not user["is_active"]:
        raise ApiError(401, "This account is not active.", code="account_disabled")
    return user


def require_admin(user=Depends(current_user)):
    if user["role"] != "admin":
        raise ApiError(403, "Only an admin can do this.", code="forbidden")
    return user
