import { forwardRef } from "react";
import { Link } from "react-router-dom";
import Icon from "./Icon.jsx";
import { initials } from "../utils/format.js";

export function Spinner({ size = 18 }) {
  return <span className="spinner" style={{ width: size, height: size }} role="status" aria-label="Loading" />;
}

export const Button = forwardRef(function Button(
  { variant = "secondary", size = "md", icon, loading = false, children, className = "", type = "button", disabled, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`btn btn-${variant} btn-${size} ${className}`.trim()}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size={16} /> : icon ? <Icon name={icon} size={size === "sm" ? 15 : 17} /> : null}
      {children ? <span>{children}</span> : null}
    </button>
  );
});

export function ButtonLink({ to, variant = "secondary", size = "md", icon, children, className = "", ...rest }) {
  return (
    <Link to={to} className={`btn btn-${variant} btn-${size} ${className}`.trim()} {...rest}>
      {icon ? <Icon name={icon} size={size === "sm" ? 15 : 17} /> : null}
      <span>{children}</span>
    </Link>
  );
}

export function IconButton({ icon, label, tone, size = 17, className = "", ...rest }) {
  return (
    <button type="button" className={`icon-btn ${tone ? `icon-btn-${tone}` : ""} ${className}`.trim()} aria-label={label} title={label} {...rest}>
      <Icon name={icon} size={size} />
    </button>
  );
}

export function Pill({ tone = "neutral", children, dot = false, className = "" }) {
  return (
    <span className={`pill pill-${tone} ${className}`.trim()}>
      {dot ? <span className="pill-dot" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

const STOCK_LABELS = { ok: "In stock", low: "Low stock", out: "Out of stock" };
const STOCK_TONES = { ok: "good", low: "warn", out: "bad" };

export function StockPill({ status }) {
  return (
    <Pill tone={STOCK_TONES[status] || "neutral"} dot>
      {STOCK_LABELS[status] || status}
    </Pill>
  );
}

const ORDER_TONES = { draft: "neutral", ordered: "info", received: "good", cancelled: "bad" };
const ORDER_LABELS = { draft: "Draft", ordered: "Ordered", received: "Received", cancelled: "Cancelled" };

export function OrderPill({ status }) {
  return (
    <Pill tone={ORDER_TONES[status] || "neutral"} dot>
      {ORDER_LABELS[status] || status}
    </Pill>
  );
}

// The little gauge under a quantity: the notch marks the reorder level.
export function StockBar({ qty, reorder, status }) {
  const scale = Math.max(reorder * 2, qty, 1);
  const width = Math.min(100, (qty / scale) * 100);
  const notch = reorder > 0 ? Math.min(100, (reorder / scale) * 100) : null;
  return (
    <span className={`stockbar stockbar-${status}`} aria-hidden="true">
      <span style={{ width: `${width}%` }} />
      {notch !== null ? <i style={{ left: `${notch}%` }} /> : null}
    </span>
  );
}

export function Avatar({ name, size = 34 }) {
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function PageHeader({ title, subtitle, children, back }) {
  return (
    <header className="page-head">
      <div className="page-head-text">
        {back}
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {children ? <div className="page-actions">{children}</div> : null}
    </header>
  );
}

export function BackLink({ to, children }) {
  return (
    <Link to={to} className="back-link">
      <Icon name="arrow-left" size={15} />
      {children}
    </Link>
  );
}

export function EmptyState({ icon = "box", title, children, action }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name={icon} size={26} />
      </span>
      <h3>{title}</h3>
      {children ? <p>{children}</p> : null}
      {action ? <div className="empty-action">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="empty empty-error" role="alert">
      <span className="empty-icon">
        <Icon name="alert" size={26} />
      </span>
      <h3>We could not load this</h3>
      <p>{error?.message || "Something went wrong."}</p>
      {onRetry ? (
        <div className="empty-action">
          <Button icon="refresh" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function Skeleton({ width = "100%", height = 14, className = "" }) {
  return <span className={`skeleton ${className}`.trim()} style={{ width, height }} aria-hidden="true" />;
}

export function TableSkeleton({ rows = 6, cols = 5 }) {
  return (
    <div className="skeleton-table" role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, r) => (
        <div className="skeleton-row" key={r}>
          {Array.from({ length: cols }).map((__, c) => (
            <Skeleton key={c} width={c === 0 ? "70%" : "50%"} />
          ))}
        </div>
      ))}
    </div>
  );
}

// A row of mutually exclusive choices (used for status tabs and type filters).
export function Segmented({ label, value, onChange, options }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className={value === option.value ? "is-active" : ""}
          onClick={() => onChange(option.value)}
        >
          {option.label}
          {option.count !== undefined && option.count !== null ? <span className="segmented-count">{option.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder, label = "Search" }) {
  return (
    <label className="searchbox">
      <Icon name="search" size={17} />
      <span className="sr-only">{label}</span>
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoComplete="off" />
    </label>
  );
}

export function Pagination({ page, pages, total, pageSize, onPage, noun = "items" }) {
  if (!total) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav className="pagination" aria-label="Pagination">
      <p>
        Showing <strong>{from}–{to}</strong> of <strong>{total}</strong> {noun}
      </p>
      <div className="pagination-buttons">
        <Button size="sm" icon="chevron-left" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          Previous
        </Button>
        <span className="pagination-page" aria-live="polite">
          Page {page} of {pages}
        </span>
        <Button size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          Next
        </Button>
      </div>
    </nav>
  );
}

export function Stat({ label, value, hint, tone }) {
  return (
    <div className={`stat ${tone ? `stat-${tone}` : ""}`.trim()}>
      <dt>{label}</dt>
      <dd>{value}</dd>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}
