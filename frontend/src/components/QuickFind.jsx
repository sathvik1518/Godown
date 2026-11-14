import { useEffect, useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useDebounce } from "../hooks.js";
import { num } from "../utils/format.js";
import Icon from "./Icon.jsx";
import { Modal } from "./Modal.jsx";

const SHORTCUTS = [
  { label: "Go to Products", to: "/products", icon: "package" },
  { label: "Go to Stock ledger", to: "/ledger", icon: "ledger" },
  { label: "Go to Purchase orders", to: "/orders", icon: "orders" },
  { label: "Low stock products", to: "/products?status=alerts", icon: "alert" },
  { label: "Go to Suppliers", to: "/suppliers", icon: "truck" },
];

// Ctrl+K (or /) opens a search that jumps straight to a product, or to a page.
export default function QuickFind({ onClose }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState([]);
  const [active, setActive] = useState(0);
  const listId = useId();
  const debounced = useDebounce(query.trim(), 180);

  useEffect(() => {
    if (!debounced) {
      setItems([]);
      return undefined;
    }
    let alive = true;
    api
      .products({ q: debounced, page_size: 7 })
      .then((r) => alive && setItems(r.items))
      .catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, [debounced]);

  const rows = query.trim()
    ? items.map((p) => ({ key: `p${p.id}`, to: `/products/${p.id}`, product: p }))
    : SHORTCUTS.map((s) => ({ key: s.to, to: s.to, shortcut: s }));

  useEffect(() => setActive(0), [query, items.length]);

  const go = (row) => {
    onClose();
    navigate(row.to);
  };

  const onKeyDown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => Math.min(rows.length - 1, i + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (event.key === "Enter" && rows[active]) {
      event.preventDefault();
      go(rows[active]);
    }
  };

  return (
    <Modal title="Quick find" variant="palette" onClose={onClose}>
      <div className="palette-input">
        <Icon name="search" size={18} />
        <input
          data-autofocus
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-label="Search products by name or SKU"
          aria-activedescendant={rows[active] ? `${listId}-${rows[active].key}` : undefined}
          placeholder="Search products by name or SKU…"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <kbd>Esc</kbd>
      </div>
      <ul className="palette-list" id={listId} role="listbox">
        {query.trim() && !items.length ? <li className="picker-note">No products match “{query.trim()}”.</li> : null}
        {rows.map((row, index) => (
          <li
            key={row.key}
            id={`${listId}-${row.key}`}
            role="option"
            aria-selected={index === active}
            className={index === active ? "is-active" : ""}
            onMouseEnter={() => setActive(index)}
            onMouseDown={(e) => {
              e.preventDefault();
              go(row);
            }}
          >
            {row.product ? (
              <>
                <span className="picker-main">
                  <strong>{row.product.name}</strong>
                  <small>
                    {row.product.sku} · {row.product.category_name}
                  </small>
                </span>
                <span className={`picker-qty picker-qty-${row.product.stock_status}`}>
                  {num(row.product.qty_on_hand)} {row.product.unit}
                </span>
              </>
            ) : (
              <span className="palette-shortcut">
                <Icon name={row.shortcut.icon} size={17} />
                {row.shortcut.label}
              </span>
            )}
          </li>
        ))}
      </ul>
    </Modal>
  );
}
