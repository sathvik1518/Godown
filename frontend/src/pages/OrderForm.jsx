import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { Field, FormError, Select } from "../components/Form.jsx";
import Icon from "../components/Icon.jsx";
import ProductPicker from "../components/ProductPicker.jsx";
import { BackLink, Button, EmptyState, ErrorState, IconButton, PageHeader, Skeleton } from "../components/ui.jsx";
import { useToast } from "../context/Toast.jsx";
import { useDocumentTitle, useLoad } from "../hooks.js";
import { inr, num, todayISO } from "../utils/format.js";
import { isWholeNumber, splitError } from "../utils/forms.js";

const validCost = (value) => /^\d+(\.\d{1,2})?$/.test(String(value).trim()) && Number(value) <= 9999999.99;

export function validateOrder(form, lines) {
  const errors = {};
  if (!form.supplier_id) errors.supplier_id = "Choose a supplier.";
  if (form.expected_date && form.expected_date < todayISO()) errors.expected_date = "Choose today or a later date.";
  if (!lines.length) errors.items = "Add at least one product.";
  lines.forEach((line, index) => {
    if (!isWholeNumber(line.quantity) || Number(line.quantity) < 1) errors[`items.${index}.quantity`] = "Whole number, 1 or more.";
    if (!validCost(line.unit_cost)) errors[`items.${index}.unit_cost`] = "Enter an amount.";
  });
  return errors;
}

// Used for both "new order" and "edit draft". Draft orders can be changed until an admin places them.
export default function OrderForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  useDocumentTitle(editing ? "Edit order" : "New order");
  const toast = useToast();
  const navigate = useNavigate();
  const [search] = useSearchParams();

  const suppliers = useLoad(() => api.suppliers({ status: "active" }), []);
  const existing = useLoad(() => (editing ? api.order(id) : Promise.resolve(null)), [id]);

  const [form, setForm] = useState({ supplier_id: search.get("supplier") || "", expected_date: "", notes: "" });
  const [lines, setLines] = useState([]);
  const [onlySupplier, setOnlySupplier] = useState(true);
  const [errors, setErrors] = useState({});
  const [general, setGeneral] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(!editing);

  useEffect(() => {
    const order = existing.data;
    if (!order || loaded) return;
    setForm({
      supplier_id: String(order.supplier_id),
      expected_date: order.expected_date ? String(order.expected_date).slice(0, 10) : "",
      notes: order.notes || "",
    });
    setLines(
      order.items.map((i) => ({
        product: { id: i.product_id, name: i.product_name, sku: i.sku, unit: i.unit, qty_on_hand: i.qty_on_hand },
        quantity: String(i.quantity),
        unit_cost: String(i.unit_cost),
      }))
    );
    setLoaded(true);
  }, [existing.data, loaded]);

  const set = (key) => (event) => {
    setForm((f) => ({ ...f, [key]: event.target.value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const addProduct = (product) => {
    if (!product) return;
    const suggested = Math.max(product.reorder_level * 2 - product.qty_on_hand, product.reorder_level, 1);
    setLines((list) => [...list, { product, quantity: String(suggested), unit_cost: String(product.cost_price) }]);
    setErrors((e) => ({ ...e, items: undefined }));
  };

  const changeLine = (index, key, value) => {
    setLines((list) => list.map((line, i) => (i === index ? { ...line, [key]: value } : line)));
    setErrors((e) => ({ ...e, [`items.${index}.${key}`]: undefined }));
  };

  const removeLine = (index) => setLines((list) => list.filter((_, i) => i !== index));

  const total = lines.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unit_cost) || 0), 0);
  const units = lines.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);

  const submit = async (event) => {
    event.preventDefault();
    const found = validateOrder(form, lines);
    setErrors(found);
    setGeneral("");
    if (Object.keys(found).length) return;

    const body = {
      supplier_id: Number(form.supplier_id),
      expected_date: form.expected_date || undefined,
      notes: form.notes || undefined,
      items: lines.map((l) => ({ product_id: l.product.id, quantity: Number(l.quantity), unit_cost: Number(l.unit_cost) })),
    };
    setBusy(true);
    try {
      const saved = editing ? await api.updateOrder(id, body) : await api.createOrder(body);
      toast.success(editing ? `${saved.po_number} updated.` : `${saved.po_number} created as a draft.`);
      navigate(`/orders/${saved.id}`);
    } catch (error) {
      const { fields, general: message } = splitError(error);
      setErrors(fields);
      setGeneral(message);
    } finally {
      setBusy(false);
    }
  };

  if (editing && existing.error) {
    return (
      <>
        <PageHeader title="Edit order" back={<BackLink to="/orders">All orders</BackLink>} />
        <ErrorState error={existing.error} onRetry={existing.reload} />
      </>
    );
  }

  if (editing && existing.data && existing.data.status !== "draft") {
    return (
      <>
        <PageHeader title={existing.data.po_number} back={<BackLink to={`/orders/${id}`}>Back to order</BackLink>} />
        <EmptyState icon="orders" title="Only drafts can be edited">
          This order is {existing.data.status}. Once an order is placed it is fixed so the paperwork matches what the supplier received.
        </EmptyState>
      </>
    );
  }

  if (editing && !loaded) {
    return (
      <>
        <PageHeader title="Edit order" back={<BackLink to="/orders">All orders</BackLink>} />
        <div className="card card-pad">
          <Skeleton width="30%" height={20} />
          <Skeleton height={140} />
        </div>
      </>
    );
  }

  const supplierId = form.supplier_id ? Number(form.supplier_id) : undefined;

  return (
    <>
      <PageHeader
        title={editing ? `Edit ${existing.data?.po_number || "order"}` : "New purchase order"}
        subtitle="Choose a supplier, add the products you want, and save it as a draft."
        back={<BackLink to={editing ? `/orders/${id}` : "/orders"}>{editing ? "Back to order" : "All orders"}</BackLink>}
      />

      <form className="order-form" onSubmit={submit} noValidate>
        <FormError message={general} />

        <section className="card card-pad">
          <div className="form-row form-row-3">
            <Field label="Supplier" required error={errors.supplier_id}>
              <Select value={form.supplier_id} onChange={set("supplier_id")}>
                <option value="">Choose a supplier…</option>
                {(suppliers.data || []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Expected delivery" error={errors.expected_date}>
              <input className="input" type="date" min={todayISO()} value={form.expected_date} onChange={set("expected_date")} />
            </Field>
            <Field label="Notes" error={errors.notes}>
              <input className="input" value={form.notes} onChange={set("notes")} maxLength={250} placeholder="Optional" />
            </Field>
          </div>
        </section>

        <section className="card card-pad" aria-labelledby="lines-title">
          <header className="card-head">
            <div>
              <h2 id="lines-title">Products</h2>
              <p>Quantities are pre-filled to bring stock back to twice the reorder level.</p>
            </div>
          </header>

          <div className="add-line">
            <Field label="Add a product">
              <ProductPicker value={null} onChange={addProduct} exclude={lines.map((l) => l.product.id)} supplierId={onlySupplier ? supplierId : undefined} placeholder="Search name or SKU, then press Enter" />
            </Field>
            {supplierId ? (
              <label className="check">
                <input type="checkbox" checked={onlySupplier} onChange={(e) => setOnlySupplier(e.target.checked)} />
                Only this supplier’s products
              </label>
            ) : null}
          </div>

          {errors.items ? (
            <p className="error-text" role="alert">
              <Icon name="alert" size={14} /> {errors.items}
            </p>
          ) : null}

          {lines.length ? (
            <div className="lines" role="table" aria-label="Order lines">
              <div className="lines-head" role="row">
                <span role="columnheader">Product</span>
                <span role="columnheader">On hand</span>
                <span role="columnheader">Quantity</span>
                <span role="columnheader">Cost each (₹)</span>
                <span role="columnheader" className="num">Line total</span>
                <span role="columnheader" aria-label="Remove" />
              </div>
              {lines.map((line, index) => {
                const lineTotal = (Number(line.quantity) || 0) * (Number(line.unit_cost) || 0);
                const qErr = errors[`items.${index}.quantity`];
                const cErr = errors[`items.${index}.unit_cost`] || errors[`items.${index}.product_id`];
                return (
                  <div className="line" role="row" key={line.product.id}>
                    <span className="line-product" role="cell">
                      <strong>{line.product.name}</strong>
                      <small className="mono">{line.product.sku}</small>
                    </span>
                    <span className="line-onhand" role="cell">
                      <small className="line-mobile-label">On hand</small>
                      {num(line.product.qty_on_hand)} {line.product.unit}
                    </span>
                    <span role="cell">
                      <Field label="Quantity" error={qErr} className="line-field">
                        <input className="input" inputMode="numeric" aria-label={`Quantity for ${line.product.name}`} value={line.quantity} onChange={(e) => changeLine(index, "quantity", e.target.value)} />
                      </Field>
                    </span>
                    <span role="cell">
                      <Field label="Cost each (₹)" error={cErr} className="line-field">
                        <input className="input" inputMode="decimal" aria-label={`Cost each for ${line.product.name}`} value={line.unit_cost} onChange={(e) => changeLine(index, "unit_cost", e.target.value)} />
                      </Field>
                    </span>
                    <span className="line-total num" role="cell">
                      {inr(lineTotal)}
                    </span>
                    <span role="cell">
                      <IconButton icon="trash" label={`Remove ${line.product.name}`} tone="danger" onClick={() => removeLine(index)} />
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState icon="orders" title="No products added yet">
              Search above to add the first product.
            </EmptyState>
          )}

          <footer className="order-total">
            <span>
              {lines.length} product{lines.length === 1 ? "" : "s"} · {num(units)} units
            </span>
            <strong>
              Order total <span className="mono">{inr(total)}</span>
            </strong>
          </footer>
        </section>

        <div className="form-actions">
          <Button onClick={() => navigate(editing ? `/orders/${id}` : "/orders")} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={busy}>
            {editing ? "Save changes" : "Save as draft"}
          </Button>
        </div>
      </form>
    </>
  );
}
