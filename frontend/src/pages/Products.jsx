import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import Icon from "../components/Icon.jsx";
import ProductForm from "../components/ProductForm.jsx";
import {
  Button, EmptyState, ErrorState, IconButton, Pagination, SearchBox, Segmented, StockBar, StockPill, TableSkeleton, PageHeader,
} from "../components/ui.jsx";
import { useAuth } from "../context/Auth.jsx";
import { useStockActions } from "../context/StockActions.jsx";
import { useToast } from "../context/Toast.jsx";
import { useDebounce, useDocumentTitle, useLoad, useMediaQuery } from "../hooks.js";
import { inr, num } from "../utils/format.js";
import { Select } from "../components/Form.jsx";

const PAGE_SIZE = 15;

function SortHeader({ label, field, sort, order, onSort, className = "" }) {
  const active = sort === field;
  return (
    <th scope="col" className={className} aria-sort={active ? (order === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className="sort-btn" onClick={() => onSort(field)}>
        {label}
        {active ? <Icon name={order === "asc" ? "chevron-up" : "chevron-down"} size={13} /> : null}
      </button>
    </th>
  );
}

export default function Products() {
  useDocumentTitle("Products");
  const { isAdmin } = useAuth();
  const stock = useStockActions();
  const toast = useToast();
  const phone = useMediaQuery("(max-width: 760px)");
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState(undefined); // undefined = closed, null = new, object = edit
  const [exporting, setExporting] = useState(false);

  const q = params.get("q") || "";
  const status = params.get("status") || "all";
  const category = params.get("category") || "";
  const supplier = params.get("supplier") || "";
  const sort = params.get("sort") || "name";
  const order = params.get("order") || "asc";
  const page = Number(params.get("page") || 1);

  const [search, setSearch] = useState(q);
  const debouncedSearch = useDebounce(search, 300);

  const update = (patch) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        Object.entries(patch).forEach(([key, value]) => {
          if (value === "" || value === null || value === undefined || (key === "status" && value === "all")) next.delete(key);
          else next.set(key, value);
        });
        if (!("page" in patch)) next.delete("page");
        return next;
      },
      { replace: true }
    );

  useEffect(() => {
    if (debouncedSearch !== q) update({ q: debouncedSearch });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const filters = { q: q || undefined, status, category_id: category || undefined, supplier_id: supplier || undefined };
  const list = useLoad(
    () => api.products({ ...filters, sort, order, page, page_size: PAGE_SIZE }),
    [q, status, category, supplier, sort, order, page]
  );
  const summary = useLoad(() => api.productSummary(), []);
  const categories = useLoad(() => api.categories(), []);
  const suppliers = useLoad(() => api.suppliers({ status: "active" }), []);

  const onSort = (field) => {
    if (sort === field) update({ sort: field, order: order === "asc" ? "desc" : "asc" });
    else update({ sort: field, order: field === "qty" || field === "value" ? "asc" : "asc" });
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      await api.exportProducts({ ...filters });
    } catch (error) {
      toast.error(error.message);
    } finally {
      setExporting(false);
    }
  };

  const s = summary.data;
  const tabs = [
    { value: "all", label: "All", count: s ? s.total : null },
    { value: "alerts", label: "Needs restocking", count: s ? Number(s.low) + Number(s.out) : null },
    { value: "low", label: "Low", count: s ? s.low : null },
    { value: "out", label: "Out", count: s ? s.out : null },
    { value: "ok", label: "In stock" },
    { value: "archived", label: "Archived", count: s ? s.archived : null },
  ];

  const filtered = Boolean(q || category || supplier || status !== "all");
  const clearFilters = () => {
    setSearch("");
    setParams({}, { replace: true });
  };

  const items = list.data?.items || [];

  const rowActions = (p) => (
    <div className="row-actions">
      {p.is_active ? (
        <>
          <IconButton icon="receive" label={`Receive stock for ${p.name}`} onClick={() => stock.receive(p)} />
          <IconButton icon="issue" label={`Issue stock for ${p.name}`} onClick={() => stock.issue(p)} />
        </>
      ) : null}
      {isAdmin ? <IconButton icon="edit" label={`Edit ${p.name}`} onClick={() => setEditing(p)} /> : null}
    </div>
  );

  return (
    <>
      <PageHeader title="Products" subtitle="Everything you buy and sell, with live stock levels.">
        <Button icon="download" onClick={exportCsv} loading={exporting}>
          Export CSV
        </Button>
        {isAdmin ? (
          <Button variant="primary" icon="plus" onClick={() => setEditing(null)}>
            New product
          </Button>
        ) : null}
      </PageHeader>

      <div className="toolbar">
        <Segmented label="Stock status" value={status} onChange={(value) => update({ status: value })} options={tabs} />
      </div>
      <div className="toolbar toolbar-filters">
        <SearchBox value={search} onChange={setSearch} placeholder="Search name or SKU" label="Search products" />
        <div className="filter-select">
          <span className="sr-only" id="cat-label">Category</span>
          <Select aria-labelledby="cat-label" value={category} onChange={(e) => update({ category: e.target.value })}>
            <option value="">All categories</option>
            {(categories.data || []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="filter-select">
          <span className="sr-only" id="sup-label">Supplier</span>
          <Select aria-labelledby="sup-label" value={supplier} onChange={(e) => update({ supplier: e.target.value })}>
            <option value="">All suppliers</option>
            {(suppliers.data || []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        {filtered ? (
          <Button variant="ghost" size="sm" icon="x" onClick={clearFilters}>
            Clear filters
          </Button>
        ) : null}
      </div>

      <section className="card" aria-label="Product list">
        {list.error && !list.data ? (
          <ErrorState error={list.error} onRetry={list.reload} />
        ) : list.loading && !list.data ? (
          <TableSkeleton rows={8} cols={6} />
        ) : !items.length ? (
          <EmptyState
            icon="package"
            title={filtered ? "No products match" : "No products yet"}
            action={
              filtered ? (
                <Button onClick={clearFilters}>Clear filters</Button>
              ) : isAdmin ? (
                <Button variant="primary" icon="plus" onClick={() => setEditing(null)}>
                  Add your first product
                </Button>
              ) : null
            }
          >
            {filtered ? "Try a different search or remove a filter." : "Products you add will appear here."}
          </EmptyState>
        ) : phone ? (
          <ul className="cardlist">
            {items.map((p) => (
              <li key={p.id} className={p.is_active ? "" : "is-archived"}>
                <div className="cardlist-top">
                  <Link to={`/products/${p.id}`} className="cardlist-title">
                    {p.name}
                  </Link>
                  <StockPill status={p.stock_status} />
                </div>
                <p className="cardlist-sub">
                  <span className="mono">{p.sku}</span> · {p.category_name}
                </p>
                <div className="cardlist-qty">
                  <strong>
                    {num(p.qty_on_hand)} <small>{p.unit}</small>
                  </strong>
                  <StockBar qty={p.qty_on_hand} reorder={p.reorder_level} status={p.stock_status} />
                  <small>reorder at {num(p.reorder_level)}</small>
                </div>
                <div className="cardlist-foot">
                  <span>
                    {inr(p.sell_price, 0)} <small>selling</small>
                  </span>
                  {rowActions(p)}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">Products with stock levels, prices and values</caption>
              <thead>
                <tr>
                  <SortHeader label="Product" field="name" sort={sort} order={order} onSort={onSort} />
                  <th scope="col" className="col-md">Category</th>
                  <SortHeader label="Stock" field="qty" sort={sort} order={order} onSort={onSort} />
                  <th scope="col">Status</th>
                  <SortHeader label="Price" field="price" sort={sort} order={order} onSort={onSort} className="num col-lg" />
                  <SortHeader label="Value" field="value" sort={sort} order={order} onSort={onSort} className="num col-md" />
                  <th scope="col" className="actions-col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id} className={p.is_active ? "" : "is-archived"}>
                    <td>
                      <Link to={`/products/${p.id}`} className="cell-title">
                        {p.name}
                      </Link>
                      <span className="cell-sub mono">
                        {p.sku}
                        {p.location ? ` · ${p.location}` : ""}
                      </span>
                    </td>
                    <td className="col-md">{p.category_name}</td>
                    <td>
                      <div className="stockcell">
                        <strong>
                          {num(p.qty_on_hand)} <small>{p.unit}</small>
                        </strong>
                        <StockBar qty={p.qty_on_hand} reorder={p.reorder_level} status={p.stock_status} />
                      </div>
                      <span className="cell-sub">reorder at {num(p.reorder_level)}</span>
                    </td>
                    <td>
                      <StockPill status={p.stock_status} />
                    </td>
                    <td className="num col-lg">
                      {inr(p.sell_price, 0)}
                      <span className="cell-sub">cost {inr(p.cost_price, 0)}</span>
                    </td>
                    <td className="num col-md">{inr(p.stock_value, 0)}</td>
                    <td className="actions-col">{rowActions(p)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list.data ? <Pagination page={list.data.page} pages={list.data.pages} total={list.data.total} pageSize={list.data.page_size} onPage={(p) => update({ page: p })} noun="products" /> : null}
      </section>

      {editing !== undefined ? (
        <ProductForm
          product={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            list.reload();
            summary.reload();
          }}
        />
      ) : null}
    </>
  );
}
