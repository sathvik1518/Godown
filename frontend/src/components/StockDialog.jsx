import { useState } from "react";
import { api } from "../api.js";
import { useToast } from "../context/Toast.jsx";
import { useLoad } from "../hooks.js";
import { ADJUST_REASONS, ISSUE_REASONS, inr, num } from "../utils/format.js";
import { isWholeNumber, splitError } from "../utils/forms.js";
import { Field, FormError, FormRow, Select } from "./Form.jsx";
import { Modal } from "./Modal.jsx";
import ProductPicker from "./ProductPicker.jsx";
import { Button, StockBar, StockPill } from "./ui.jsx";

const COPY = {
  receive: { title: "Receive stock", subtitle: "Goods arrived from a supplier. This adds to the stock on hand.", button: "Add to stock" },
  issue: { title: "Issue stock", subtitle: "Goods leaving the shop. Stock can never go below zero.", button: "Remove from stock" },
  adjust: { title: "Adjust stock count", subtitle: "Set stock to the quantity you counted. The difference is recorded in the ledger.", button: "Save count" },
};

const defaultsFor = (mode, product) => ({
  quantity: "",
  supplier_id: product?.supplier_id ? String(product.supplier_id) : "",
  unit_cost: product ? String(product.cost_price) : "",
  reference: "",
  note: "",
  reason: mode === "adjust" ? "stock_count" : "sale",
  new_quantity: product ? String(product.qty_on_hand) : "",
});

export function validateStock(mode, product, form) {
  const errors = {};
  if (!product) errors.product_id = "Choose a product.";
  if (mode === "adjust") {
    if (!isWholeNumber(form.new_quantity) || Number(form.new_quantity) < 0) {
      errors.new_quantity = "Enter the counted quantity (0 or more).";
    } else if (product && Number(form.new_quantity) === product.qty_on_hand) {
      errors.new_quantity = "This matches the system quantity, so there is nothing to adjust.";
    }
    if ((form.note || "").trim().length < 3) errors.note = "Add a short note explaining the adjustment.";
    return errors;
  }
  if (!isWholeNumber(form.quantity) || Number(form.quantity) < 1) {
    errors.quantity = "Enter a whole number, 1 or more.";
  } else if (mode === "issue" && product && Number(form.quantity) > product.qty_on_hand) {
    errors.quantity = `Only ${num(product.qty_on_hand)} ${product.unit} in stock.`;
  }
  if (mode === "receive" && form.unit_cost !== "" && !(Number(form.unit_cost) >= 0)) {
    errors.unit_cost = "Enter a valid cost.";
  }
  return errors;
}

export default function StockDialog({ mode, product: initialProduct, onClose, onDone }) {
  const toast = useToast();
  const [product, setProduct] = useState(initialProduct || null);
  const [form, setForm] = useState(() => defaultsFor(mode, initialProduct));
  const [errors, setErrors] = useState({});
  const [general, setGeneral] = useState("");
  const [busy, setBusy] = useState(false);
  const suppliers = useLoad(() => (mode === "receive" ? api.suppliers({ status: "active" }) : Promise.resolve([])), [mode]);

  const copy = COPY[mode];
  const set = (key) => (event) => {
    setForm((f) => ({ ...f, [key]: event.target.value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const pick = (chosen) => {
    setProduct(chosen);
    setForm(defaultsFor(mode, chosen));
    setErrors({});
    setGeneral("");
  };

  const qty = Number(form.quantity);
  const after =
    !product
      ? null
      : mode === "adjust"
        ? isWholeNumber(form.new_quantity) ? Number(form.new_quantity) : null
        : isWholeNumber(form.quantity) && qty >= 1
          ? product.qty_on_hand + (mode === "receive" ? qty : -qty)
          : null;
  const difference = after !== null && product ? after - product.qty_on_hand : null;

  const submit = async (event) => {
    event.preventDefault();
    const found = validateStock(mode, product, form);
    setErrors(found);
    setGeneral("");
    if (Object.keys(found).length) return;

    setBusy(true);
    try {
      let result;
      if (mode === "receive") {
        result = await api.receive({
          product_id: product.id,
          quantity: Number(form.quantity),
          supplier_id: form.supplier_id ? Number(form.supplier_id) : undefined,
          unit_cost: form.unit_cost !== "" ? Number(form.unit_cost) : undefined,
          reference: form.reference || undefined,
          note: form.note || undefined,
        });
        toast.success(`Received ${num(form.quantity)} ${product.unit} of ${product.name}. Now ${num(result.balance_after)} in stock.`);
      } else if (mode === "issue") {
        result = await api.issue({
          product_id: product.id,
          quantity: Number(form.quantity),
          reason: form.reason,
          reference: form.reference || undefined,
          note: form.note || undefined,
        });
        toast.success(`Issued ${num(form.quantity)} ${product.unit} of ${product.name}. ${num(result.balance_after)} left.`);
      } else {
        result = await api.adjust({
          product_id: product.id,
          new_quantity: Number(form.new_quantity),
          reason: form.reason,
          note: form.note,
        });
        toast.success(`Stock count saved. ${product.name} is now ${num(result.balance_after)}.`);
      }
      onDone(result);
    } catch (error) {
      const { fields, general: message } = splitError(error);
      setErrors(fields);
      setGeneral(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={copy.title}
      subtitle={copy.subtitle}
      onClose={onClose}
      onSubmit={submit}
      busy={busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={busy} icon={mode === "issue" ? "issue" : mode === "receive" ? "receive" : "sliders"}>
            {copy.button}
          </Button>
        </>
      }
    >
      <FormError message={general} />

      <Field label="Product" required error={errors.product_id}>
        <ProductPicker value={product} onChange={pick} />
      </Field>

      {product ? (
        <div className="product-strip">
          <div>
            <strong>{product.name}</strong>
            <small>
              {product.sku} · Shelf {product.location || "—"}
            </small>
          </div>
          <div className="product-strip-qty">
            <span>
              <b>{num(product.qty_on_hand)}</b> {product.unit} on hand
            </span>
            <StockBar qty={product.qty_on_hand} reorder={product.reorder_level} status={product.stock_status} />
            <StockPill status={product.stock_status} />
          </div>
        </div>
      ) : null}

      {mode === "adjust" ? (
        <>
          <FormRow>
            <Field label="Counted quantity" required error={errors.new_quantity}>
              <input className="input" inputMode="numeric" value={form.new_quantity} onChange={set("new_quantity")} data-autofocus />
            </Field>
            <Field label="Reason" required error={errors.reason}>
              <Select value={form.reason} onChange={set("reason")}>
                {ADJUST_REASONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
          </FormRow>
          <Field label="Note" required error={errors.note} hint="For example: Counted shelf A-04 after the morning delivery.">
            <textarea className="input" rows={2} value={form.note} onChange={set("note")} maxLength={250} />
          </Field>
        </>
      ) : (
        <>
          <FormRow>
            <Field label={mode === "receive" ? "Quantity received" : "Quantity to issue"} required error={errors.quantity}>
              <input className="input" inputMode="numeric" value={form.quantity} onChange={set("quantity")} data-autofocus />
            </Field>
            {mode === "receive" ? (
              <Field label="Cost per unit (₹)" error={errors.unit_cost} hint="Updates the product's cost price.">
                <input className="input" inputMode="decimal" value={form.unit_cost} onChange={set("unit_cost")} />
              </Field>
            ) : (
              <Field label="Reason" required error={errors.reason}>
                <Select value={form.reason} onChange={set("reason")}>
                  {ISSUE_REASONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </FormRow>
          {mode === "receive" ? (
            <Field label="Supplier" error={errors.supplier_id}>
              <Select value={form.supplier_id} onChange={set("supplier_id")}>
                <option value="">No supplier</option>
                {(suppliers.data || []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <FormRow>
            <Field label={mode === "receive" ? "Invoice or challan no." : "Bill or reference no."} error={errors.reference}>
              <input className="input" value={form.reference} onChange={set("reference")} maxLength={60} />
            </Field>
            <Field label="Note" error={errors.note}>
              <input className="input" value={form.note} onChange={set("note")} maxLength={250} />
            </Field>
          </FormRow>
        </>
      )}

      {after !== null ? (
        <p className={`preview ${after < 0 ? "preview-bad" : ""}`} aria-live="polite">
          Stock after this: <strong>{num(after)}</strong> {product.unit}
          {difference !== null && difference !== 0 ? (
            <span className={difference > 0 ? "preview-up" : "preview-down"}>
              {" "}
              ({difference > 0 ? "+" : "−"}
              {num(Math.abs(difference))})
            </span>
          ) : null}
          {mode === "receive" && form.unit_cost !== "" && qty >= 1 ? <span className="preview-muted"> · Value {inr(qty * Number(form.unit_cost))}</span> : null}
        </p>
      ) : null}
    </Modal>
  );
}
