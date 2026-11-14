"""One error format for the whole API.

Every error response looks like:
    {"detail": "Readable message", "code": "machine_code", "errors": {"field": "message"}}
`errors` is only present for field problems, so forms can show them next to the input.
"""
import logging

import psycopg2
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from psycopg2 import errors as pgerr

log = logging.getLogger("godown")


class ApiError(Exception):
    def __init__(self, status_code, detail, code=None, errors=None, **extra):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail
        self.code = code
        self.errors = errors
        self.extra = extra


def _body(detail, code=None, errors=None, **extra):
    body = {"detail": detail}
    if code:
        body["code"] = code
    if errors:
        body["errors"] = errors
    body.update(extra)
    return body


# constraint name -> (field, message)
UNIQUE_MESSAGES = {
    "uq_users_email": ("email", "An account with this email already exists."),
    "uq_categories_name": ("name", "A category with this name already exists."),
    "uq_suppliers_name": ("name", "A supplier with this name already exists."),
    "uq_products_sku": ("sku", "This SKU is already used by another product."),
}


def friendly_message(err):
    """Turn a pydantic error into a short sentence a shop owner can act on."""
    kind = err.get("type", "")
    ctx = err.get("ctx") or {}
    if kind in ("missing", "string_type", "none_required"):
        return "This field is required."
    if kind == "string_too_short":
        return f"Must be at least {ctx.get('min_length')} characters."
    if kind == "string_too_long":
        return f"Must be at most {ctx.get('max_length')} characters."
    if kind == "greater_than_equal":
        return f"Must be {ctx.get('ge')} or more."
    if kind == "greater_than":
        return f"Must be greater than {ctx.get('gt')}."
    if kind == "less_than_equal":
        return f"Must be {ctx.get('le')} or less."
    if kind in ("int_parsing", "int_type", "int_from_float"):
        return "Enter a whole number."
    if kind.startswith("decimal") or kind in ("float_parsing", "float_type"):
        return "Enter a valid amount (up to 2 decimal places)."
    if kind == "string_pattern_mismatch":
        return "Format is not valid."
    if kind == "literal_error":
        return "Choose one of the allowed values."
    if kind == "date_from_datetime_parsing" or kind.startswith("date"):
        return "Enter a valid date."
    if kind == "extra_forbidden":
        return "Unexpected field."
    if kind == "too_short":
        return f"Add at least {ctx.get('min_length')} item(s)."
    msg = err.get("msg", "Invalid value.")
    return msg[len("Value error, "):] if msg.startswith("Value error, ") else msg


def register_error_handlers(app: FastAPI):
    @app.exception_handler(ApiError)
    async def api_error(_: Request, exc: ApiError):
        return JSONResponse(
            _body(exc.detail, exc.code, exc.errors, **exc.extra), status_code=exc.status_code
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError):
        fields = {}
        for err in exc.errors():
            path = [str(p) for p in err["loc"] if p not in ("body", "query", "path")]
            key = ".".join(path) or "request"
            fields.setdefault(key, friendly_message(err))
        first = next(iter(fields.values()), "Invalid request.")
        detail = "Please correct the highlighted fields." if len(fields) > 1 or "request" not in fields else first
        return JSONResponse(_body(detail, "validation_error", fields), status_code=422)

    @app.exception_handler(pgerr.UniqueViolation)
    async def unique_violation(_: Request, exc):
        field, message = UNIQUE_MESSAGES.get(
            exc.diag.constraint_name, (None, "This value already exists.")
        )
        return JSONResponse(
            _body(message, "duplicate", {field: message} if field else None), status_code=409
        )

    @app.exception_handler(pgerr.ForeignKeyViolation)
    async def fk_violation(_: Request, exc):
        return JSONResponse(
            _body("This record is still used by other records.", "in_use"), status_code=409
        )

    @app.exception_handler(pgerr.CheckViolation)
    async def check_violation(_: Request, exc):
        if exc.diag.constraint_name == "products_qty_non_negative":
            return JSONResponse(
                _body("Stock cannot go below zero.", "insufficient_stock"), status_code=409
            )
        return JSONResponse(_body("A value is outside the allowed range.", "out_of_range"), status_code=422)

    @app.exception_handler(pgerr.RestrictViolation)
    async def ledger_locked(_: Request, exc):
        return JSONResponse(
            _body("Ledger entries are permanent and cannot be edited or deleted.", "ledger_locked"),
            status_code=409,
        )

    @app.exception_handler(psycopg2.OperationalError)
    async def db_unreachable(_: Request, exc):
        log.error("database unreachable: %s", exc)
        return JSONResponse(
            _body("The database is not reachable right now. Please try again in a moment.", "db_unavailable"),
            status_code=503,
        )

    @app.exception_handler(psycopg2.ProgrammingError)
    async def db_programming(_: Request, exc):
        log.error("database error: %s", exc)
        if "invalid dsn" in str(exc).lower():
            return JSONResponse(
                _body("Database connection string is invalid. Check DATABASE_URL.", "db_config"),
                status_code=503,
            )
        return JSONResponse(_body("Unexpected database error.", "server_error"), status_code=500)
