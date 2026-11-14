"""Product categories. Everyone can read, only admins can change."""
from fastapi import APIRouter, Depends

import db
from deps import current_user, require_admin
from errors import ApiError
from schemas import CategoryIn

router = APIRouter(prefix="/categories", tags=["Categories"])

LIST_SQL = """
    SELECT c.id, c.name, c.description, c.created_at,
           COUNT(p.id) FILTER (WHERE p.is_active) AS product_count
      FROM categories c
      LEFT JOIN products p ON p.category_id = c.id
"""


@router.get("")
def list_categories(user=Depends(current_user)):
    return db.fetch_all(LIST_SQL + " GROUP BY c.id ORDER BY lower(c.name)")


@router.post("", status_code=201)
def create_category(body: CategoryIn, admin=Depends(require_admin)):
    return db.fetch_one(
        "INSERT INTO categories (name, description) VALUES (%s, %s) RETURNING id, name, description, created_at",
        (body.name, body.description),
    )


@router.put("/{category_id}")
def update_category(category_id: int, body: CategoryIn, admin=Depends(require_admin)):
    row = db.fetch_one(
        "UPDATE categories SET name = %s, description = %s WHERE id = %s RETURNING id, name, description, created_at",
        (body.name, body.description, category_id),
    )
    if not row:
        raise ApiError(404, "Category not found.", code="not_found")
    return row


@router.delete("/{category_id}", status_code=204)
def delete_category(category_id: int, admin=Depends(require_admin)):
    with db.transaction() as cur:
        cur.execute("SELECT COUNT(*) AS n FROM products WHERE category_id = %s", (category_id,))
        used = cur.fetchone()["n"]
        if used:
            raise ApiError(
                409, f"{used} product(s) use this category. Move them to another category first.", code="in_use"
            )
        cur.execute("DELETE FROM categories WHERE id = %s", (category_id,))
        if cur.rowcount == 0:
            raise ApiError(404, "Category not found.", code="not_found")
