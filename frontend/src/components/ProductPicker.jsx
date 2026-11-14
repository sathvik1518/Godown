import { useEffect, useId, useRef, useState } from "react";
import { api } from "../api.js";
import { useDebounce } from "../hooks.js";
import { num } from "../utils/format.js";
import Icon from "./Icon.jsx";

// A search box that finds products by name or SKU (an accessible "combobox").
// Arrow keys move through the list, Enter picks, Esc closes.
export default function ProductPicker({
  value,
  onChange,
  exclude = [],
  supplierId,
  placeholder = "Search by name or SKU",
  disabled = false,
  id,
  ...aria
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const debounced = useDebounce(query, 200);
  const box = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    setLoading(true);
    api
      .products({ q: debounced, page_size: 8, supplier_id: supplierId || undefined })
      .then((result) => alive && setItems(result.items.filter((p) => !exclude.includes(p.id))))
      .catch(() => alive && setItems([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, open, supplierId, exclude.join(",")]);

  useEffect(() => setActive(0), [items]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (box.current && !box.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const choose = (product) => {
    onChange(product);
    setOpen(false);
    setQuery("");
  };

  const onKeyDown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(items.length - 1, i + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (event.key === "Enter" && open && items[active]) {
      event.preventDefault();
      choose(items[active]);
    } else if (event.key === "Escape" && open) {
      event.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <div className="picker" ref={box}>
      <div className="picker-input">
        <Icon name="search" size={16} />
        <input
          id={id}
          className="input"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && items[active] ? `${listId}-${items[active].id}` : undefined}
          autoComplete="off"
          disabled={disabled}
          placeholder={value ? "" : placeholder}
          value={open ? query : value ? `${value.name}` : ""}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          {...aria}
        />
        {value && !open ? <span className="picker-sku">{value.sku}</span> : null}
      </div>
      {open ? (
        <ul className="picker-list" id={listId} role="listbox">
          {loading && !items.length ? <li className="picker-note">Searching…</li> : null}
          {!loading && !items.length ? <li className="picker-note">No products found.</li> : null}
          {items.map((product, index) => (
            <li
              key={product.id}
              id={`${listId}-${product.id}`}
              role="option"
              aria-selected={index === active}
              className={index === active ? "is-active" : ""}
              onMouseDown={(event) => {
                event.preventDefault();
                choose(product);
              }}
              onMouseEnter={() => setActive(index)}
            >
              <span className="picker-main">
                <strong>{product.name}</strong>
                <small>{product.sku}</small>
              </span>
              <span className={`picker-qty picker-qty-${product.stock_status}`}>
                {num(product.qty_on_hand)} {product.unit}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
