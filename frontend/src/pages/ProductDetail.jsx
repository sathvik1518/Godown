import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api.js";
import { LevelChart } from "../components/Charts.jsx";
import MovementTable from "../components/MovementTable.jsx";
import ProductForm from "../components/ProductForm.jsx";
import {
  BackLink, Button, EmptyState, ErrorState, PageHeader, Pagination, Skeleton, Stat, StockBar, StockPill, TableSkeleton,
} from "../components/ui.jsx";
import { useAuth } from "../context/Auth.jsx";
import { useStockActions } from "../context/StockActions.jsx";
import { useDocumentTitle, useLoad } from "../hooks.js";
import { ago, inr, marginPercent, num } from "../utils/format.js";

export default function ProductDetail() {
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const stock = useStockActions();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(false);

  const product = useLoad(() => api.product(id), [id]);
  const ledger = useLoad(() => api.movements({ product_id: id, page, page_size: 10 }), [id, page]);
  const history = useLoad(() => api.movements({ product_id: id, page_size: 40 }), [id]);
  const p = product.data;
  useDocumentTitle(p ? p.name : "Product");

  if (product.error && !p) {
    const missing = product.error.status === 404;
    return (
      <>
        <PageHeader title={missing ? "Product not found" : "Product"} back={<BackLink to="/products">All products</BackLink>} />
        {missing ? (
          <EmptyState icon="package" title="This product does not exist" action={<Button onClick={() => window.history.back()}>Go back</Button>}>
            It may have been deleted.
          </EmptyState>
        ) : (
          <ErrorState error={product.error} onRetry={product.reload} />
        )}
      </>
    );
  }

  if (!p) {
    return (
      <>
        <PageHeader title=" " back={<BackLink to="/products">All products</BackLink>} />
        <div className="card card-pad">
          <Skeleton width="40%" height={22} />
          <Skeleton height={120} />
        </div>
      </>
    );
  }

  const margin = marginPercent(p.cost_price, p.sell_price);
  const points = (history.data?.items || [])
    .slice()
    .reverse()
    .map((m) => ({ at: m.created_at, balance: m.balance_after }));

  return (
    <>
      <PageHeader
        title={p.name}
        back={<BackLink to="/products">All products</BackLink>}
        subtitle={
          <span className="detail-meta">
            <span className="mono">{p.sku}</span>
            <span>{p.category_name}</span>
            {p.supplier_name ? <span>Supplier: {p.supplier_name}</span> : null}
            {p.location ? <span>Shelf {p.location}</span> : null}
          </span>
        }
      >
        {p.is_active ? (
          <>
            <Button variant="primary" icon="receive" onClick={() => stock.receive(p)}>
              Receive
            </Button>
            <Button icon="issue" onClick={() => stock.issue(p)}>
              Issue
            </Button>
            {isAdmin ? (
              <Button icon="sliders" onClick={() => stock.adjust(p)}>
                Adjust
              </Button>
            ) : null}
          </>
        ) : null}
        {isAdmin ? (
          <Button icon="edit" onClick={() => setEditing(true)}>
            Edit
          </Button>
        ) : null}
      </PageHeader>

      {!p.is_active ? (
        <div className="banner banner-warn" role="status">
          This product is archived. It stays in the ledger but cannot receive or issue stock.
        </div>
      ) : null}

      <section className="card detail-hero" aria-label="Stock summary">
        <div className="detail-onhand">
          <span className="detail-label">On hand</span>
          <strong>
            {num(p.qty_on_hand)} <small>{p.unit}</small>
          </strong>
          <StockBar qty={p.qty_on_hand} reorder={p.reorder_level} status={p.stock_status} />
          <StockPill status={p.stock_status} />
        </div>
        <dl className="stats">
          <Stat label="Reorder level" value={num(p.reorder_level)} hint={p.qty_on_hand <= p.reorder_level ? "At or below this now" : "Alert when stock reaches this"} tone={p.qty_on_hand <= p.reorder_level ? "warn" : undefined} />
          <Stat label="On order" value={num(p.on_order)} hint={p.on_order ? "From placed purchase orders" : "Nothing incoming"} />
          <Stat label="Issued, 30 days" value={num(p.issued_30d)} hint={p.last_movement_at ? `Last movement ${ago(p.last_movement_at)}` : "No movements yet"} />
          <Stat label="Days of cover" value={p.days_of_cover === null ? "—" : `${num(p.days_of_cover)} d`} hint={p.days_of_cover === null ? "No issues in 30 days" : "At the 30-day pace"} />
          <Stat label="Stock value" value={inr(p.stock_value, 0)} hint={`At ${inr(p.cost_price)} each`} />
          <Stat label="Selling price" value={inr(p.sell_price)} hint={margin === null ? "" : `${margin.toFixed(1)}% margin`} />
        </dl>
      </section>

      <div className="detail-grid">
        <section className="card card-pad" aria-labelledby="level-title">
          <header className="card-head">
            <div>
              <h2 id="level-title">Stock level</h2>
              <p>After each of the last {Math.min(points.length, 40)} movements</p>
            </div>
          </header>
          {points.length >= 2 ? (
            <LevelChart points={points} reorder={p.reorder_level} />
          ) : (
            <EmptyState icon="ledger" title="Not enough history yet">
              The chart appears after a couple of movements.
            </EmptyState>
          )}
        </section>

        <section className="card" aria-labelledby="ledger-title">
          <header className="card-head card-head-pad">
            <div>
              <h2 id="ledger-title">Ledger</h2>
              <p>Every change to this product</p>
            </div>
            <Link className="link-more" to={`/ledger?q=${encodeURIComponent(p.sku)}`}>
              Open in full ledger
            </Link>
          </header>
          {ledger.error && !ledger.data ? (
            <ErrorState error={ledger.error} onRetry={ledger.reload} />
          ) : ledger.loading && !ledger.data ? (
            <TableSkeleton rows={5} cols={5} />
          ) : !ledger.data.items.length ? (
            <EmptyState icon="ledger" title="No movements yet">
              Receive or issue stock to start the history.
            </EmptyState>
          ) : (
            <MovementTable items={ledger.data.items} showProduct={false} />
          )}
          {ledger.data ? <Pagination page={ledger.data.page} pages={ledger.data.pages} total={ledger.data.total} pageSize={ledger.data.page_size} onPage={setPage} noun="movements" /> : null}
        </section>
      </div>

      {editing ? (
        <ProductForm
          product={p}
          onClose={() => setEditing(false)}
          onSaved={(saved, action) => {
            setEditing(false);
            if (action === "deleted") window.location.hash = "#/products";
            else product.reload();
          }}
        />
      ) : null}
    </>
  );
}
