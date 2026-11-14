import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { CategoryBars, TrendChart } from "../components/Charts.jsx";
import Icon from "../components/Icon.jsx";
import { Button, EmptyState, ErrorState, IconButton, OrderPill, PageHeader, Skeleton, StockBar, StockPill } from "../components/ui.jsx";
import { useAuth } from "../context/Auth.jsx";
import { useRefresh } from "../context/Refresh.jsx";
import { useStockActions } from "../context/StockActions.jsx";
import { useToast } from "../context/Toast.jsx";
import { useDocumentTitle, useLoad } from "../hooks.js";
import { ago, greeting, inr, longDate, num, reasonLabel, shortDate } from "../utils/format.js";

function Kpi({ label, value, hint, tone, to, icon }) {
  const body = (
    <>
      <span className="kpi-label">
        <Icon name={icon} size={15} /> {label}
      </span>
      <strong className="kpi-value">{value}</strong>
      <span className="kpi-hint">{hint}</span>
    </>
  );
  return to ? (
    <Link className={`kpi kpi-link ${tone ? `kpi-${tone}` : ""}`} to={to}>
      {body}
    </Link>
  ) : (
    <div className={`kpi ${tone ? `kpi-${tone}` : ""}`}>{body}</div>
  );
}

function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading dashboard">
      <div className="kpi-grid">
        {[0, 1, 2, 3].map((i) => (
          <div className="kpi" key={i}>
            <Skeleton width="45%" />
            <Skeleton width="70%" height={30} />
            <Skeleton width="60%" />
          </div>
        ))}
      </div>
      <div className="dash-grid">
        <div className="card card-pad">
          <Skeleton width="30%" height={18} />
          <Skeleton height={200} />
        </div>
        <div className="card card-pad">
          <Skeleton width="40%" height={18} />
          <Skeleton height={200} />
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  useDocumentTitle("Dashboard");
  const { user } = useAuth();
  const stock = useStockActions();
  const toast = useToast();
  const navigate = useNavigate();
  const { bump } = useRefresh();
  const { data, error, loading, reload } = useLoad(() => api.dashboard(), []);
  const [drafting, setDrafting] = useState(false);

  const draftOrders = async () => {
    setDrafting(true);
    try {
      const result = await api.ordersFromLowStock();
      const made = result.created.length;
      const skipped = result.skipped_already_ordered + result.skipped_no_supplier;
      if (made) {
        const lines = result.created.reduce((sum, o) => sum + Number(o.item_count), 0);
        toast.success(`Created ${made} draft order${made > 1 ? "s" : ""} covering ${lines} product${lines > 1 ? "s" : ""}.`);
        bump();
        navigate("/orders?status=draft");
      } else {
        toast.info(skipped ? "Everything low is already on an order or has no supplier set." : "Nothing needs ordering right now.");
      }
    } catch (e) {
      toast.error(e.message);
    } finally {
      setDrafting(false);
    }
  };

  if (error && !data) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <ErrorState error={error} onRetry={reload} />
      </>
    );
  }

  const k = data?.kpis;
  const needs = k ? Number(k.low_stock) + Number(k.out_of_stock) : 0;

  return (
    <>
      <PageHeader title={`${greeting()}, ${user.name.split(" ")[0]}`} subtitle={data ? longDate(data.today) : " "}>
        <div className="show-sm-only page-quick">
          <Button variant="primary" icon="receive" onClick={() => stock.receive()}>
            Receive
          </Button>
          <Button icon="issue" onClick={() => stock.issue()}>
            Issue
          </Button>
        </div>
      </PageHeader>

      {!data ? (
        <DashboardSkeleton />
      ) : (
        <>
          <section className="kpi-grid" aria-label="Key figures">
            <Kpi icon="rupee" label="Stock value" value={inr(k.stock_value, 0)} hint={`${num(k.units_on_hand)} units · ${k.total_products} products`} />
            <Kpi
              icon="alert"
              label="Needs restocking"
              tone={needs ? "warn" : "good"}
              value={needs}
              hint={needs ? `${k.out_of_stock} out of stock · ${k.low_stock} low` : "Everything is above reorder level"}
              to="/products?status=alerts"
            />
            <Kpi
              icon="refresh"
              label="Moved today"
              value={
                <>
                  <span className="in">+{num(data.moved_today.units_in)}</span> <span className="slash">/</span> <span className="out">−{num(data.moved_today.units_out)}</span>
                </>
              }
              hint={`${data.moved_today.transactions} transaction${Number(data.moved_today.transactions) === 1 ? "" : "s"} today`}
              to="/ledger"
            />
            <Kpi
              icon="orders"
              label="Open purchase orders"
              value={Number(data.order_counts.ordered) + Number(data.order_counts.draft)}
              hint={`${data.order_counts.ordered} placed · ${data.order_counts.draft} draft`}
              to="/orders?status=open"
            />
          </section>

          <div className="dash-grid">
            <section className="card card-pad" aria-labelledby="trend-title">
              <header className="card-head">
                <div>
                  <h2 id="trend-title">Stock movement, last 14 days</h2>
                  <p>Units received and issued each day</p>
                </div>
              </header>
              <TrendChart data={data.trend} />
            </section>

            <section className="card card-pad restock" aria-labelledby="restock-title">
              <header className="card-head">
                <div>
                  <h2 id="restock-title">Needs restocking</h2>
                  <p>{needs ? `${needs} product${needs > 1 ? "s" : ""} at or below reorder level` : "Nothing is running low"}</p>
                </div>
                {needs ? (
                  <Link to="/products?status=alerts" className="link-more">
                    View all
                  </Link>
                ) : null}
              </header>
              {data.low_stock.length ? (
                <ul className="restock-list">
                  {data.low_stock.map((p) => (
                    <li key={p.id}>
                      <div className="restock-main">
                        <Link to={`/products/${p.id}`}>{p.name}</Link>
                        <small>
                          {p.supplier_name || "No supplier"}
                          {Number(p.on_order) > 0 ? <span className="on-order"> · {num(p.on_order)} on order</span> : null}
                        </small>
                      </div>
                      <div className="restock-qty">
                        <strong>
                          {num(p.qty_on_hand)} <small>/ {num(p.reorder_level)}</small>
                        </strong>
                        <StockBar qty={p.qty_on_hand} reorder={p.reorder_level} status={p.stock_status} />
                      </div>
                      <IconButton icon="receive" label={`Receive stock for ${p.name}`} onClick={() => stock.receive(p)} />
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon="check" title="All stocked up">
                  Every product is above its reorder level.
                </EmptyState>
              )}
              {needs ? (
                <footer className="card-foot">
                  <Button variant="primary" icon="zap" loading={drafting} onClick={draftOrders}>
                    Draft purchase orders
                  </Button>
                  <small>One draft per supplier. Nothing is sent until you place it.</small>
                </footer>
              ) : null}
            </section>
          </div>

          <div className="dash-grid dash-grid-3">
            <section className="card card-pad" aria-labelledby="cat-title">
              <header className="card-head">
                <div>
                  <h2 id="cat-title">Stock value by category</h2>
                  <p>At cost price</p>
                </div>
              </header>
              <CategoryBars categories={data.categories} />
            </section>

            <section className="card card-pad" aria-labelledby="po-title">
              <header className="card-head">
                <div>
                  <h2 id="po-title">Open purchase orders</h2>
                  <p>Drafts and orders awaiting delivery</p>
                </div>
                <Link to="/orders" className="link-more">
                  All orders
                </Link>
              </header>
              {data.open_orders.length ? (
                <ul className="po-list">
                  {data.open_orders.map((o) => {
                    const overdue = o.status === "ordered" && o.expected_date && o.expected_date < data.today;
                    return (
                      <li key={o.id}>
                        <div>
                          <Link to={`/orders/${o.id}`} className="mono">
                            {o.po_number}
                          </Link>
                          <small>{o.supplier_name}</small>
                        </div>
                        <div className="po-right">
                          <OrderPill status={o.status} />
                          <small className={overdue ? "text-bad" : ""}>
                            {o.expected_date ? `${overdue ? "Was due" : "Due"} ${shortDate(o.expected_date)}` : "No date"} · {inr(o.total_amount, 0)}
                          </small>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <EmptyState icon="orders" title="No open orders">
                  Draft orders from low stock will show up here.
                </EmptyState>
              )}
            </section>

            <section className="card card-pad" aria-labelledby="act-title">
              <header className="card-head">
                <div>
                  <h2 id="act-title">Recent activity</h2>
                  <p>Latest stock movements</p>
                </div>
                <Link to="/ledger" className="link-more">
                  Full ledger
                </Link>
              </header>
              <ul className="feed">
                {data.recent_movements.map((m) => (
                  <li key={m.id}>
                    <span className={`feed-dot feed-${m.movement_type}`} aria-hidden="true">
                      <Icon name={m.movement_type === "receipt" ? "receive" : m.movement_type === "issue" ? "issue" : "sliders"} size={14} />
                    </span>
                    <div className="feed-main">
                      <Link to={`/products/${m.product_id}`}>{m.product_name}</Link>
                      <small>
                        {m.movement_type === "receipt" ? "Received" : m.movement_type === "issue" ? "Issued" : "Adjusted"}
                        {m.reason && m.movement_type !== "receipt" ? ` · ${reasonLabel(m.reason)}` : ""} · {m.user_name || "System"} · {ago(m.created_at)}
                      </small>
                    </div>
                    <strong className={m.quantity > 0 ? "qty-in" : "qty-out"}>
                      {m.quantity > 0 ? "+" : "−"}
                      {num(Math.abs(m.quantity))}
                    </strong>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </>
      )}
    </>
  );
}
