import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { ConfirmDialog } from "../components/Modal.jsx";
import {
  Button, ButtonLink, EmptyState, ErrorState, OrderPill, PageHeader, Pagination, SearchBox, Segmented, TableSkeleton,
} from "../components/ui.jsx";
import { useRefresh } from "../context/Refresh.jsx";
import { useToast } from "../context/Toast.jsx";
import { useDebounce, useDocumentTitle, useLoad, useMediaQuery } from "../hooks.js";
import { dateTime, inr, num, shortDate, todayISO } from "../utils/format.js";

const PAGE_SIZE = 15;
const TABS = [
  { value: "open", label: "Open" },
  { value: "draft", label: "Drafts" },
  { value: "ordered", label: "Placed" },
  { value: "received", label: "Received" },
  { value: "cancelled", label: "Cancelled" },
  { value: "all", label: "All" },
];

export function isOverdue(order) {
  return order.status === "ordered" && order.expected_date && String(order.expected_date).slice(0, 10) < todayISO();
}

export default function Orders() {
  useDocumentTitle("Purchase orders");
  const toast = useToast();
  const { bump } = useRefresh();
  const phone = useMediaQuery("(max-width: 760px)");
  const [params, setParams] = useSearchParams();
  const [confirm, setConfirm] = useState(false);
  const [drafting, setDrafting] = useState(false);

  const status = params.get("status") || "open";
  const q = params.get("q") || "";
  const page = Number(params.get("page") || 1);
  const [search, setSearch] = useState(q);
  const debounced = useDebounce(search, 300);

  const update = (patch) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        Object.entries(patch).forEach(([key, value]) => {
          if (value === "" || value == null || (key === "status" && value === "open")) next.delete(key);
          else next.set(key, value);
        });
        if (!("page" in patch)) next.delete("page");
        return next;
      },
      { replace: true }
    );

  useEffect(() => {
    if (debounced !== q) update({ q: debounced });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const list = useLoad(() => api.orders({ status, q: q || undefined, page, page_size: PAGE_SIZE }), [status, q, page]);
  const items = list.data?.items || [];

  const draftFromLowStock = async () => {
    setDrafting(true);
    try {
      const result = await api.ordersFromLowStock();
      const made = result.created.length;
      const skipped = result.skipped_already_ordered + result.skipped_no_supplier;
      setConfirm(false);
      if (made) {
        toast.success(`Created ${made} draft order${made > 1 ? "s" : ""}.${skipped ? ` ${skipped} product${skipped > 1 ? "s were" : " was"} skipped (already on order or no supplier).` : ""}`);
        bump();
        update({ status: "draft" });
      } else {
        toast.info(skipped ? "Everything low is already on an order or has no supplier set." : "Nothing needs ordering right now.");
      }
    } catch (error) {
      toast.error(error.message);
      setConfirm(false);
    } finally {
      setDrafting(false);
    }
  };

  const expected = (o) =>
    o.expected_date ? (
      <span className={isOverdue(o) ? "text-bad" : ""}>
        {shortDate(o.expected_date)}
        {isOverdue(o) ? " · overdue" : ""}
      </span>
    ) : (
      <span className="muted">Not set</span>
    );

  return (
    <>
      <PageHeader title="Purchase orders" subtitle="Order from suppliers, then receive the goods to add them to stock.">
        <Button icon="zap" onClick={() => setConfirm(true)}>
          Draft from low stock
        </Button>
        <ButtonLink to="/orders/new" variant="primary" icon="plus">
          New order
        </ButtonLink>
      </PageHeader>

      <div className="toolbar">
        <Segmented label="Order status" value={status} onChange={(value) => update({ status: value })} options={TABS} />
      </div>
      <div className="toolbar toolbar-filters">
        <SearchBox value={search} onChange={setSearch} placeholder="PO number or supplier" label="Search orders" />
      </div>

      <section className="card" aria-label="Purchase order list">
        {list.error && !list.data ? (
          <ErrorState error={list.error} onRetry={list.reload} />
        ) : list.loading && !list.data ? (
          <TableSkeleton rows={6} cols={6} />
        ) : !items.length ? (
          <EmptyState
            icon="orders"
            title={q || status !== "open" ? "No orders here" : "No open orders"}
            action={
              <ButtonLink to="/orders/new" variant="primary" icon="plus">
                Create an order
              </ButtonLink>
            }
          >
            {q ? "No order matches that search." : "Orders you create will be listed here."}
          </EmptyState>
        ) : phone ? (
          <ul className="cardlist">
            {items.map((o) => (
              <li key={o.id}>
                <div className="cardlist-top">
                  <Link to={`/orders/${o.id}`} className="cardlist-title mono">
                    {o.po_number}
                  </Link>
                  <OrderPill status={o.status} />
                </div>
                <p className="cardlist-sub">{o.supplier_name}</p>
                <p className="cardlist-sub">
                  {o.item_count} items · {num(o.total_units)} units · <strong>{inr(o.total_amount, 0)}</strong>
                </p>
                <p className="cardlist-sub">Expected: {expected(o)}</p>
              </li>
            ))}
          </ul>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">Purchase orders</caption>
              <thead>
                <tr>
                  <th scope="col">Order</th>
                  <th scope="col">Supplier</th>
                  <th scope="col" className="col-md">Items</th>
                  <th scope="col" className="num">Total</th>
                  <th scope="col">Expected</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="col-lg">Created</th>
                </tr>
              </thead>
              <tbody>
                {items.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link to={`/orders/${o.id}`} className="cell-title mono">
                        {o.po_number}
                      </Link>
                    </td>
                    <td>{o.supplier_name}</td>
                    <td className="col-md">
                      {o.item_count} <span className="muted">products · {num(o.total_units)} units</span>
                    </td>
                    <td className="num">{inr(o.total_amount, 0)}</td>
                    <td>{expected(o)}</td>
                    <td>
                      <OrderPill status={o.status} />
                    </td>
                    <td className="col-lg">
                      {dateTime(o.created_at)}
                      <span className="cell-sub">{o.created_by_name || "—"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list.data ? <Pagination page={list.data.page} pages={list.data.pages} total={list.data.total} pageSize={list.data.page_size} onPage={(p) => update({ page: p })} noun="orders" /> : null}
      </section>

      {confirm ? (
        <ConfirmDialog
          title="Draft orders from low stock?"
          confirmLabel="Create drafts"
          busy={drafting}
          onConfirm={draftFromLowStock}
          onClose={() => setConfirm(false)}
        >
          <p>
            Godown will create one draft order per supplier for every product at or below its reorder level, sized to refill it to twice the reorder level.
          </p>
          <p>Products already on an open order, or without a supplier, are skipped. Drafts are not sent until an admin places them.</p>
        </ConfirmDialog>
      ) : null}
    </>
  );
}
