import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import Icon from "../components/Icon.jsx";
import SupplierForm from "../components/SupplierForm.jsx";
import { Button, ButtonLink, EmptyState, ErrorState, IconButton, PageHeader, Pill, SearchBox, Segmented, Skeleton } from "../components/ui.jsx";
import { useAuth } from "../context/Auth.jsx";
import { useDebounce, useDocumentTitle, useLoad } from "../hooks.js";

export default function Suppliers() {
  useDocumentTitle("Suppliers");
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("active");
  const [editing, setEditing] = useState(undefined);
  const q = useDebounce(search.trim(), 250);
  const list = useLoad(() => api.suppliers({ q: q || undefined, status }), [q, status]);
  const items = list.data || [];

  return (
    <>
      <PageHeader title="Suppliers" subtitle="The people and firms you buy from.">
        {isAdmin ? (
          <Button variant="primary" icon="plus" onClick={() => setEditing(null)}>
            New supplier
          </Button>
        ) : null}
      </PageHeader>

      <div className="toolbar toolbar-filters">
        <Segmented
          label="Supplier status"
          value={status}
          onChange={setStatus}
          options={[
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
            { value: "all", label: "All" },
          ]}
        />
        <SearchBox value={search} onChange={setSearch} placeholder="Name, contact or GSTIN" label="Search suppliers" />
      </div>

      {list.error && !list.data ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : list.loading && !list.data ? (
        <div className="supplier-grid">
          {[0, 1, 2].map((i) => (
            <div className="card card-pad" key={i}>
              <Skeleton width="60%" height={18} />
              <Skeleton />
              <Skeleton width="80%" />
            </div>
          ))}
        </div>
      ) : !items.length ? (
        <section className="card">
          <EmptyState
            icon="truck"
            title={q ? "No suppliers match" : "No suppliers yet"}
            action={
              isAdmin && !q ? (
                <Button variant="primary" icon="plus" onClick={() => setEditing(null)}>
                  Add a supplier
                </Button>
              ) : null
            }
          >
            {q ? "Try a different search." : "Add the firms you buy stock from."}
          </EmptyState>
        </section>
      ) : (
        <ul className="supplier-grid">
          {items.map((s) => (
            <li key={s.id} className={`card supplier ${s.is_active ? "" : "is-archived"}`}>
              <header>
                <div>
                  <h2>{s.name}</h2>
                  {s.contact_person ? <p>{s.contact_person}</p> : null}
                </div>
                {s.is_active ? null : <Pill>Inactive</Pill>}
              </header>
              <ul className="supplier-contact">
                {s.phone ? (
                  <li>
                    <Icon name="phone" size={15} /> <a href={`tel:${s.phone.replace(/\s/g, "")}`}>{s.phone}</a>
                  </li>
                ) : null}
                {s.email ? (
                  <li>
                    <Icon name="mail" size={15} /> <a href={`mailto:${s.email}`}>{s.email}</a>
                  </li>
                ) : null}
                {s.address ? (
                  <li>
                    <Icon name="pin" size={15} /> <span>{s.address}</span>
                  </li>
                ) : null}
              </ul>
              {s.gstin ? <p className="supplier-gstin">GSTIN <span className="mono">{s.gstin}</span></p> : null}
              <footer>
                <div className="supplier-counts">
                  <Link to={`/products?supplier=${s.id}`}>
                    <strong>{s.product_count}</strong> products
                  </Link>
                  <Link to={`/orders?status=open&q=${encodeURIComponent(s.name)}`}>
                    <strong>{s.open_orders}</strong> open orders
                  </Link>
                </div>
                <div className="row-actions">
                  {s.is_active ? <ButtonLink to={`/orders/new?supplier=${s.id}`} size="sm" icon="plus">Order</ButtonLink> : null}
                  {isAdmin ? <IconButton icon="edit" label={`Edit ${s.name}`} onClick={() => setEditing(s)} /> : null}
                </div>
              </footer>
            </li>
          ))}
        </ul>
      )}

      {editing !== undefined ? (
        <SupplierForm
          supplier={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            list.reload();
          }}
        />
      ) : null}
    </>
  );
}
