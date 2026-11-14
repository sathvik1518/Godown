import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api.js";
import Icon from "../components/Icon.jsx";
import { ConfirmDialog } from "../components/Modal.jsx";
import { BackLink, Button, ButtonLink, EmptyState, ErrorState, OrderPill, PageHeader, Skeleton } from "../components/ui.jsx";
import { useAuth } from "../context/Auth.jsx";
import { useRefresh } from "../context/Refresh.jsx";
import { useToast } from "../context/Toast.jsx";
import { useDocumentTitle, useLoad } from "../hooks.js";
import { dateTime, inr, num, shortDate } from "../utils/format.js";
import { isOverdue } from "./Orders.jsx";

function Timeline({ order }) {
  const steps = [
    { key: "created", label: "Created", at: order.created_at, who: order.created_by_name, done: true },
    { key: "ordered", label: "Placed with supplier", at: order.ordered_at, done: Boolean(order.ordered_at) },
  ];
  if (order.status === "cancelled") steps.push({ key: "cancelled", label: "Cancelled", at: order.cancelled_at, done: true, bad: true });
  else steps.push({ key: "received", label: "Goods received", at: order.received_at, done: Boolean(order.received_at) });

  return (
    <ol className="timeline" aria-label="Order progress">
      {steps.map((s) => (
        <li key={s.key} className={`${s.done ? "is-done" : ""} ${s.bad ? "is-bad" : ""}`}>
          <span className="timeline-dot" aria-hidden="true">
            {s.done ? <Icon name={s.bad ? "x" : "check"} size={12} strokeWidth={3} /> : null}
          </span>
          <div>
            <strong>{s.label}</strong>
            <small>{s.at ? `${dateTime(s.at)}${s.who ? ` · ${s.who}` : ""}` : "Waiting"}</small>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function OrderDetail() {
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const toast = useToast();
  const { bump } = useRefresh();
  const { data: order, error, reload } = useLoad(() => api.order(id), [id]);
  const [action, setAction] = useState(null); // "place" | "receive" | "cancel"
  const [busy, setBusy] = useState(false);
  useDocumentTitle(order ? order.po_number : "Purchase order");

  if (error && !order) {
    const missing = error.status === 404;
    return (
      <>
        <PageHeader title={missing ? "Order not found" : "Purchase order"} back={<BackLink to="/orders">All orders</BackLink>} />
        {missing ? <EmptyState icon="orders" title="This order does not exist" /> : <ErrorState error={error} onRetry={reload} />}
      </>
    );
  }

  if (!order) {
    return (
      <>
        <PageHeader title=" " back={<BackLink to="/orders">All orders</BackLink>} />
        <div className="card card-pad">
          <Skeleton width="35%" height={22} />
          <Skeleton height={160} />
        </div>
      </>
    );
  }

  const run = async () => {
    setBusy(true);
    try {
      if (action === "place") {
        await api.placeOrder(order.id);
        toast.success(`${order.po_number} placed. Mark it received when the goods arrive.`);
      } else if (action === "receive") {
        await api.receiveOrder(order.id);
        toast.success(`${num(order.total_units)} units added to stock from ${order.po_number}.`);
        bump();
      } else {
        await api.cancelOrder(order.id);
        toast.success(`${order.po_number} cancelled.`);
      }
      setAction(null);
      reload();
    } catch (e) {
      toast.error(e.message);
      setAction(null);
      reload();
    } finally {
      setBusy(false);
    }
  };

  const overdue = isOverdue(order);
  const open = order.status === "draft" || order.status === "ordered";

  return (
    <>
      <PageHeader
        title={<span className="mono">{order.po_number}</span>}
        back={<BackLink to="/orders">All orders</BackLink>}
        subtitle={
          <span className="detail-meta">
            <OrderPill status={order.status} />
            <span>{order.supplier_name}</span>
            <span className={overdue ? "text-bad" : ""}>
              {order.expected_date ? `${overdue ? "Was due" : "Expected"} ${shortDate(order.expected_date)}` : "No delivery date"}
            </span>
          </span>
        }
      >
        <Button icon="download" onClick={() => window.print()} className="no-print">
          Print
        </Button>
        {order.status === "draft" ? (
          <>
            <ButtonLink to={`/orders/${order.id}/edit`} icon="edit">
              Edit
            </ButtonLink>
            {isAdmin ? (
              <Button variant="primary" icon="check" onClick={() => setAction("place")}>
                Place order
              </Button>
            ) : null}
          </>
        ) : null}
        {order.status === "ordered" ? (
          <Button variant="primary" icon="receive" onClick={() => setAction("receive")}>
            Receive goods
          </Button>
        ) : null}
        {open && isAdmin ? (
          <Button variant="ghost-danger" icon="x" onClick={() => setAction("cancel")}>
            Cancel order
          </Button>
        ) : null}
      </PageHeader>

      {order.status === "draft" && !isAdmin ? (
        <div className="banner banner-info" role="status">
          This draft needs an admin to place it before the goods can be received.
        </div>
      ) : null}

      <div className="detail-grid detail-grid-order">
        <section className="card" aria-labelledby="items-title">
          <header className="card-head card-head-pad">
            <div>
              <h2 id="items-title">Items</h2>
              <p>
                {order.item_count} products · {num(order.total_units)} units
              </p>
            </div>
          </header>
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">Items on {order.po_number}</caption>
              <thead>
                <tr>
                  <th scope="col">Product</th>
                  <th scope="col" className="num">Ordered</th>
                  <th scope="col" className="num col-md">Cost each</th>
                  <th scope="col" className="num">Line total</th>
                  <th scope="col" className="num col-md">Stock now</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <Link to={`/products/${i.product_id}`} className="cell-title">
                        {i.product_name}
                      </Link>
                      <span className="cell-sub mono">{i.sku}</span>
                    </td>
                    <td className="num">
                      {num(i.quantity)} <small className="muted">{i.unit}</small>
                    </td>
                    <td className="num col-md">{inr(i.unit_cost)}</td>
                    <td className="num">{inr(i.line_total)}</td>
                    <td className="num col-md">{num(i.qty_on_hand)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" colSpan={3} className="num col-span-md">
                    Order total
                  </th>
                  <td className="num total-cell">{inr(order.total_amount)}</td>
                  <td className="col-md" />
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        <aside className="stack">
          <section className="card card-pad" aria-labelledby="progress-title">
            <header className="card-head">
              <div>
                <h2 id="progress-title">Progress</h2>
              </div>
            </header>
            <Timeline order={order} />
            {order.status === "received" ? (
              <Link className="link-more" to={`/ledger?q=${encodeURIComponent(order.po_number)}`}>
                See the stock receipts in the ledger
              </Link>
            ) : null}
          </section>

          <section className="card card-pad" aria-labelledby="notes-title">
            <header className="card-head">
              <div>
                <h2 id="notes-title">Notes</h2>
              </div>
            </header>
            <p className="notes">{order.notes || <span className="muted">No notes on this order.</span>}</p>
          </section>
        </aside>
      </div>

      {action ? (
        <ConfirmDialog
          title={action === "place" ? "Place this order?" : action === "receive" ? "Receive these goods?" : "Cancel this order?"}
          confirmLabel={action === "place" ? "Place order" : action === "receive" ? "Add to stock" : "Cancel order"}
          tone={action === "cancel" ? "danger" : "primary"}
          busy={busy}
          onConfirm={run}
          onClose={() => setAction(null)}
        >
          {action === "place" ? (
            <p>
              <strong>{order.po_number}</strong> will be marked as sent to {order.supplier_name}. After this the items and prices are fixed.
            </p>
          ) : action === "receive" ? (
            <>
              <p>
                This adds <strong>{num(order.total_units)} units</strong> across {order.item_count} products to your stock and records each one in the ledger.
              </p>
              <p>It happens all at once, or not at all. It cannot be undone, but you can correct stock afterwards with an adjustment.</p>
            </>
          ) : (
            <p>
              <strong>{order.po_number}</strong> will be cancelled and no stock will be added. This cannot be undone.
            </p>
          )}
        </ConfirmDialog>
      ) : null}
    </>
  );
}
