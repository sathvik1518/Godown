"""Request models. Every rule here is checked before anything touches the database."""
import re
from datetime import date
from decimal import Decimal
from typing import Annotated, List, Literal, Optional

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, field_validator, model_validator

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]{2,}$")
PHONE_RE = re.compile(r"^[0-9+()\-\s]{7,20}$")
GSTIN_RE = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")
SKU_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9\-_/.]*$"

UNITS = ("pcs", "kg", "g", "l", "ml", "box", "pack", "dozen", "m", "set")
ISSUE_REASONS = ("sale", "damaged", "expired", "internal_use", "return_to_supplier", "other")
ADJUST_REASONS = ("stock_count", "correction", "write_off")

Money = Annotated[Decimal, Field(ge=0, le=Decimal("9999999.99"), max_digits=12, decimal_places=2)]
Quantity = Annotated[int, Field(ge=1, le=1_000_000)]


class Base(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    @field_validator("*", mode="before")
    @classmethod
    def blank_to_none(cls, value):
        # An empty text box means "no value".
        if isinstance(value, str) and value.strip() == "":
            return None
        return value


def check_email(value):
    if value is None:
        return value
    value = value.lower()
    if len(value) > 160 or not EMAIL_RE.match(value):
        raise ValueError("Enter a valid email address.")
    return value


def check_password(value):
    if value is None:
        return value
    if not (re.search(r"[A-Za-z]", value) and re.search(r"[0-9]", value)):
        raise ValueError("Use at least one letter and one number.")
    return value


Email = Annotated[str, AfterValidator(check_email)]
NewPassword = Annotated[str, Field(min_length=8, max_length=72), AfterValidator(check_password)]


# ---------------------------------------------------------------- auth / users
class LoginIn(Base):
    email: Email
    password: str = Field(max_length=72)


class PasswordChangeIn(Base):
    current_password: str = Field(max_length=72)
    new_password: NewPassword


class UserCreate(Base):
    name: str = Field(min_length=2, max_length=80)
    email: Email
    password: NewPassword
    role: Literal["admin", "staff"] = "staff"


class UserUpdate(Base):
    name: Optional[str] = Field(None, min_length=2, max_length=80)
    role: Optional[Literal["admin", "staff"]] = None
    is_active: Optional[bool] = None
    password: Optional[NewPassword] = None

    @model_validator(mode="after")
    def something_to_change(self):
        if not self.model_fields_set:
            raise ValueError("Nothing to update.")
        return self


# ------------------------------------------------------------ master data
class CategoryIn(Base):
    name: str = Field(min_length=2, max_length=60)
    description: Optional[str] = Field(None, max_length=200)


class SupplierIn(Base):
    name: str = Field(min_length=2, max_length=120)
    contact_person: Optional[str] = Field(None, max_length=80)
    phone: Optional[str] = None
    email: Optional[Email] = None
    address: Optional[str] = Field(None, max_length=250)
    gstin: Optional[str] = None
    is_active: bool = True

    @field_validator("phone")
    @classmethod
    def phone_ok(cls, v):
        if v is not None and not PHONE_RE.match(v):
            raise ValueError("Enter a valid phone number (digits, spaces, + - ( ) only).")
        return v

    @field_validator("gstin")
    @classmethod
    def gstin_ok(cls, v):
        if v is None:
            return v
        v = v.upper()
        if not GSTIN_RE.match(v):
            raise ValueError("GSTIN must be 15 characters, like 36AAKFS4821M1ZP.")
        return v


# ----------------------------------------------------------------- products
class ProductIn(Base):
    sku: str = Field(min_length=2, max_length=30, pattern=SKU_PATTERN)
    name: str = Field(min_length=2, max_length=120)
    category_id: int = Field(gt=0)
    supplier_id: Optional[int] = Field(None, gt=0)
    unit: Literal[UNITS] = "pcs"
    cost_price: Money = Decimal("0")
    sell_price: Money = Decimal("0")
    reorder_level: int = Field(0, ge=0, le=1_000_000)
    location: Optional[str] = Field(None, max_length=40)
    opening_stock: int = Field(0, ge=0, le=1_000_000)

    @field_validator("sku")
    @classmethod
    def sku_upper(cls, v):
        return v.upper()


class ProductUpdate(Base):
    sku: Optional[str] = Field(None, min_length=2, max_length=30, pattern=SKU_PATTERN)
    name: Optional[str] = Field(None, min_length=2, max_length=120)
    category_id: Optional[int] = Field(None, gt=0)
    supplier_id: Optional[int] = Field(None, gt=0)
    unit: Optional[Literal[UNITS]] = None
    cost_price: Optional[Money] = None
    sell_price: Optional[Money] = None
    reorder_level: Optional[int] = Field(None, ge=0, le=1_000_000)
    location: Optional[str] = Field(None, max_length=40)
    is_active: Optional[bool] = None

    @field_validator("sku")
    @classmethod
    def sku_upper(cls, v):
        return v.upper() if v else v

    @model_validator(mode="after")
    def something_to_change(self):
        if not self.model_fields_set:
            raise ValueError("Nothing to update.")
        for required in ("sku", "name", "category_id", "unit", "cost_price", "sell_price", "reorder_level"):
            if required in self.model_fields_set and getattr(self, required) is None:
                raise ValueError(f"{required} cannot be empty.")
        return self


# -------------------------------------------------------------------- stock
class ReceiptIn(Base):
    product_id: int = Field(gt=0)
    quantity: Quantity
    supplier_id: Optional[int] = Field(None, gt=0)
    unit_cost: Optional[Money] = None
    reference: Optional[str] = Field(None, max_length=60)
    note: Optional[str] = Field(None, max_length=250)


class IssueIn(Base):
    product_id: int = Field(gt=0)
    quantity: Quantity
    reason: Literal[ISSUE_REASONS] = "sale"
    reference: Optional[str] = Field(None, max_length=60)
    note: Optional[str] = Field(None, max_length=250)


class AdjustmentIn(Base):
    product_id: int = Field(gt=0)
    new_quantity: int = Field(ge=0, le=1_000_000)
    reason: Literal[ADJUST_REASONS] = "stock_count"
    note: str = Field(min_length=3, max_length=250)


# ---------------------------------------------------------- purchase orders
class POItemIn(Base):
    product_id: int = Field(gt=0)
    quantity: Quantity
    unit_cost: Money


class PurchaseOrderIn(Base):
    supplier_id: int = Field(gt=0)
    expected_date: Optional[date] = None
    notes: Optional[str] = Field(None, max_length=250)
    items: List[POItemIn] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def unique_products(self):
        ids = [i.product_id for i in self.items]
        if len(ids) != len(set(ids)):
            raise ValueError("Each product can appear only once in an order.")
        return self
