import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import MovementTable from "../components/MovementTable.jsx";
import { Field } from "../components/Form.jsx";
import { Button, EmptyState, ErrorState, PageHeader, Pagination, SearchBox, Segmented, TableSkeleton } from "../components/ui.jsx";
import { useStockActions } from "../context/StockActions.jsx";
import { useToast } from "../context/Toast.jsx";
import { useDebounce, useDocumentTitle, useLoad } from "../hooks.js";

const PAGE_SIZE = 20;

const TYPE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "receipt", label: "Receipts" },
  { value: "issue", label: "Issues" },
  { value: "adjustment", label: "Adjustments" },
];

export default function Ledger() {
  useDocumentTitle("Stock ledger");
  const stock = useStockActions();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [exporting, setExporting] = useState(false);

  const q = params.get("q") || "";
  const type = params.get("type") || "all";
  const from = params.get("from") || "";
  const to = params.get("to") || "";
  const page = Number(params.get("page") || 1);
  const [search, setSearch] = useState(q);
  const debounced = useDebounce(search, 300);

  const update = (patch) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        Object.entries(patch).forEach(([key, value]) => {
          if (value === "" || value == null || (key === "type" && value === "all")) next.delete(key);
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

  const rangeBad = from && to && from > to;
  const filters = { q: q || undefined, type: type === "all" ? undefined : type, date_from: from || undefined, date_to: to || undefined };
  const list = useLoad(
    () => (rangeBad ? Promise.resolve({ items: [], total: 0, page: 1, pages: 1, page_size: PAGE_SIZE }) : api.movements({ ...filters, page, page_size: PAGE_SIZE })),
    [q, type, from, to, page]
  );

  const filtered = Boolean(q || from || to || type !== "all");
  const clear = () => {
    setSearch("");
    setParams({}, { replace: true });
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      await api.exportMovements(filters);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setExporting(false);
    }
  };

  const items = list.data?.items || [];

  return (
    <>
      <PageHeader title="Stock ledger" subtitle="Every receipt, issue and adjustment, newest first. Entries are permanent.">
        <Button icon="download" onClick={exportCsv} loading={exporting}>
          Export CSV
        </Button>
        <Button icon="issue" onClick={() => stock.issue()}>
          Issue
        </Button>
        <Button variant="primary" icon="receive" onClick={() => stock.receive()}>
          Receive
        </Button>
      </PageHeader>

      <div className="toolbar">
        <Segmented label="Movement type" value={type} onChange={(value) => update({ type: value })} options={TYPE_OPTIONS} />
      </div>
      <div className="toolbar toolbar-filters">
        <SearchBox value={search} onChange={setSearch} placeholder="Product, SKU, invoice or PO no." label="Search the ledger" />
        <div className="date-range">
          <Field label="From" error={rangeBad ? "Start date is after the end date." : undefined}>
            <input className="input" type="date" value={from} max={to || undefined} onChange={(e) => update({ from: e.target.value })} />
          </Field>
          <Field label="To">
            <input className="input" type="date" value={to} min={from || undefined} onChange={(e) => update({ to: e.target.value })} />
          </Field>
        </div>
        {filtered ? (
          <Button variant="ghost" size="sm" icon="x" onClick={clear}>
            Clear filters
          </Button>
        ) : null}
      </div>

      <section className="card" aria-label="Stock movements">
        {list.error && !list.data ? (
          <ErrorState error={list.error} onRetry={list.reload} />
        ) : list.loading && !list.data ? (
          <TableSkeleton rows={8} cols={6} />
        ) : !items.length ? (
          <EmptyState icon="ledger" title={filtered ? "No movements match" : "No movements yet"}>
            {filtered ? "Try a wider date range or a different search." : "Receive or issue stock and it will be recorded here."}
          </EmptyState>
        ) : (
          <MovementTable items={items} />
        )}
        {list.data ? <Pagination page={list.data.page} pages={list.data.pages} total={list.data.total} pageSize={list.data.page_size} onPage={(p) => update({ page: p })} noun="movements" /> : null}
      </section>
    </>
  );
}
