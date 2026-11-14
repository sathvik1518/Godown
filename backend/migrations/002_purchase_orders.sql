-- Purchase orders. Receiving an order posts stock receipts into the ledger.

CREATE SEQUENCE po_number_seq START 1;

CREATE TABLE purchase_orders (
    id            SERIAL PRIMARY KEY,
    po_number     VARCHAR(20) NOT NULL UNIQUE,
    supplier_id   INTEGER     NOT NULL REFERENCES suppliers (id) ON DELETE RESTRICT,
    status        VARCHAR(10) NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'ordered', 'received', 'cancelled')),
    expected_date DATE,
    notes         VARCHAR(250),
    created_by    INTEGER     REFERENCES users (id) ON DELETE RESTRICT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    ordered_at    TIMESTAMPTZ,
    received_at   TIMESTAMPTZ,
    cancelled_at  TIMESTAMPTZ
);
CREATE INDEX idx_po_status ON purchase_orders (status);
CREATE INDEX idx_po_supplier ON purchase_orders (supplier_id);

CREATE TABLE purchase_order_items (
    id                SERIAL PRIMARY KEY,
    purchase_order_id INTEGER       NOT NULL REFERENCES purchase_orders (id) ON DELETE CASCADE,
    product_id        INTEGER       NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
    quantity          INTEGER       NOT NULL CHECK (quantity > 0),
    unit_cost         NUMERIC(12,2) NOT NULL CHECK (unit_cost >= 0),
    UNIQUE (purchase_order_id, product_id)
);
CREATE INDEX idx_po_items_product ON purchase_order_items (product_id);

ALTER TABLE stock_movements
    ADD COLUMN purchase_order_id INTEGER REFERENCES purchase_orders (id) ON DELETE RESTRICT;
CREATE INDEX idx_movements_po ON stock_movements (purchase_order_id);
