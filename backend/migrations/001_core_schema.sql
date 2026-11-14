-- Core schema: users, categories, suppliers, products, stock ledger.
-- Design notes
--   * products.qty_on_hand is the running balance. A CHECK constraint makes a
--     negative balance impossible even if application code has a bug.
--   * stock_movements is the ledger: one row per change, signed quantity,
--     with the balance after the change stored for easy auditing.

CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(80)  NOT NULL,
    email         VARCHAR(160) NOT NULL,
    password_hash TEXT         NOT NULL,
    role          VARCHAR(10)  NOT NULL CHECK (role IN ('admin', 'staff')),
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_users_email ON users (lower(email));

CREATE TABLE categories (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(60)  NOT NULL,
    description VARCHAR(200),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_categories_name ON categories (lower(name));

CREATE TABLE suppliers (
    id             SERIAL PRIMARY KEY,
    name           VARCHAR(120) NOT NULL,
    contact_person VARCHAR(80),
    phone          VARCHAR(20),
    email          VARCHAR(160),
    address        VARCHAR(250),
    gstin          VARCHAR(15),
    is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT suppliers_gstin_format
        CHECK (gstin IS NULL OR gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$')
);
CREATE UNIQUE INDEX uq_suppliers_name ON suppliers (lower(name));

CREATE TABLE products (
    id            SERIAL PRIMARY KEY,
    sku           VARCHAR(30)   NOT NULL,
    name          VARCHAR(120)  NOT NULL,
    category_id   INTEGER       NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
    supplier_id   INTEGER       REFERENCES suppliers (id) ON DELETE RESTRICT,
    unit          VARCHAR(12)   NOT NULL DEFAULT 'pcs',
    cost_price    NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
    sell_price    NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (sell_price >= 0),
    reorder_level INTEGER       NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
    qty_on_hand   INTEGER       NOT NULL DEFAULT 0,
    location      VARCHAR(40),
    is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT products_qty_non_negative CHECK (qty_on_hand >= 0)
);
CREATE UNIQUE INDEX uq_products_sku ON products (upper(sku));
CREATE INDEX idx_products_category ON products (category_id);
CREATE INDEX idx_products_supplier ON products (supplier_id);
CREATE INDEX idx_products_name ON products (lower(name));

CREATE TABLE stock_movements (
    id            BIGSERIAL PRIMARY KEY,
    product_id    INTEGER       NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
    movement_type VARCHAR(12)   NOT NULL CHECK (movement_type IN ('receipt', 'issue', 'adjustment')),
    quantity      INTEGER       NOT NULL CHECK (quantity <> 0),
    balance_after INTEGER       NOT NULL CHECK (balance_after >= 0),
    unit_cost     NUMERIC(12,2) CHECK (unit_cost >= 0),
    supplier_id   INTEGER       REFERENCES suppliers (id) ON DELETE RESTRICT,
    reference     VARCHAR(60),
    reason        VARCHAR(30),
    note          VARCHAR(250),
    created_by    INTEGER       REFERENCES users (id) ON DELETE RESTRICT,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT movement_sign_matches_type CHECK (
        (movement_type = 'receipt' AND quantity > 0) OR
        (movement_type = 'issue'   AND quantity < 0) OR
        (movement_type = 'adjustment')
    )
);
CREATE INDEX idx_movements_product_time ON stock_movements (product_id, created_at DESC);
CREATE INDEX idx_movements_time ON stock_movements (created_at DESC);
CREATE INDEX idx_movements_type ON stock_movements (movement_type);
