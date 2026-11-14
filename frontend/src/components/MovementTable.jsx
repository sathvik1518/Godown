import { Link } from "react-router-dom";
import { useMediaQuery } from "../hooks.js";
import { dateTime, num, reasonLabel } from "../utils/format.js";
import Icon from "./Icon.jsx";
import { Pill } from "./ui.jsx";

const TYPES = {
  receipt: { label: "Receipt", tone: "good", icon: "receive" },
  issue: { label: "Issue", tone: "out", icon: "issue" },
  adjustment: { label: "Adjustment", tone: "info", icon: "sliders" },
};

export function TypePill({ type }) {
  const t = TYPES[type] || { label: type, tone: "neutral", icon: "info" };
  return (
    <Pill tone={t.tone}>
      <Icon name={t.icon} size={13} /> {t.label}
    </Pill>
  );
}

const Qty = ({ value }) => (
  <strong className={`mono ${value > 0 ? "qty-in" : "qty-out"}`}>
    {value > 0 ? "+" : "−"}
    {num(Math.abs(value))}
  </strong>
);

function detail(m) {
  const parts = [];
  if (m.reference) parts.push(m.reference);
  if (m.reason && m.movement_type !== "receipt") parts.push(reasonLabel(m.reason));
  if (m.supplier_name && m.movement_type === "receipt") parts.push(m.supplier_name);
  return parts.join(" · ");
}

// The ledger as a table on wide screens and as cards on phones. `showProduct` is off on the product page.
export default function MovementTable({ items, showProduct = true }) {
  const phone = useMediaQuery("(max-width: 760px)");

  if (phone) {
    return (
      <ul className="cardlist">
        {items.map((m) => (
          <li key={m.id}>
            <div className="cardlist-top">
              {showProduct ? (
                <Link to={`/products/${m.product_id}`} className="cardlist-title">
                  {m.product_name}
                </Link>
              ) : (
                <TypePill type={m.movement_type} />
              )}
              <Qty value={m.quantity} />
            </div>
            <p className="cardlist-sub">
              {showProduct ? <TypePill type={m.movement_type} /> : null} {dateTime(m.created_at)} · {m.user_name || "System"}
            </p>
            <p className="cardlist-sub">
              Balance <strong className="mono">{num(m.balance_after)}</strong>
              {detail(m) ? ` · ${detail(m)}` : ""}
            </p>
            {m.note ? <p className="cardlist-note">{m.note}</p> : null}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="table-wrap">
      <table className="table">
        <caption className="sr-only">Stock movements, newest first</caption>
        <thead>
          <tr>
            <th scope="col">When</th>
            <th scope="col">Type</th>
            {showProduct ? <th scope="col">Product</th> : null}
            <th scope="col" className="num">Change</th>
            <th scope="col" className="num">Balance</th>
            <th scope="col">Details</th>
            <th scope="col" className="col-md">By</th>
          </tr>
        </thead>
        <tbody>
          {items.map((m) => (
            <tr key={m.id}>
              <td className="nowrap">{dateTime(m.created_at)}</td>
              <td>
                <TypePill type={m.movement_type} />
              </td>
              {showProduct ? (
                <td>
                  <Link to={`/products/${m.product_id}`} className="cell-title">
                    {m.product_name}
                  </Link>
                  <span className="cell-sub mono">{m.sku}</span>
                </td>
              ) : null}
              <td className="num">
                <Qty value={m.quantity} />
              </td>
              <td className="num mono">{num(m.balance_after)}</td>
              <td>
                {detail(m) || <span className="muted">—</span>}
                {m.note ? <span className="cell-sub">{m.note}</span> : null}
              </td>
              <td className="col-md">{m.user_name || "System"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
