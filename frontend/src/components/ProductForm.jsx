import { useState } from "react";
import { api } from "../api.js";
import { useToast } from "../context/Toast.jsx";
import { useLoad } from "../hooks.js";
import { UNITS, inr, marginPercent } from "../utils/format.js";
import { isWholeNumber, splitError } from "../utils/forms.js";
import { Field, FormError, FormRow, Select } from "./Form.jsx";
import { ConfirmDialog, Modal } from "./Modal.jsx";
import { Button } from "./ui.jsx";

const SKU_RE = /^[A-Za-z0-9][A-Za-z0-9\-_/.]*$/;

const blank = {
  name: "", sku: "", category_id: "", supplier_id: "", unit: "pcs",
  cost_price: "", sell_price: "", reorder_level: "0", location: "", opening_stock: "0",
};

const fromProduct = (p) => ({
  name: p.name, sku: p.sku, category_id: String(p.category_id), supplier_id: p.supplier_id ? String(p.supplier_id) : "",
  unit: p.unit, cost_price: String(p.cost_price), sell_price: String(p.sell_price),
  reorder_level: String(p.reorder_level), location: p.location || "", opening_stock: "0",
});

const validMoney = (value) => value !== "" && Number(value) >= 0 && Number(value) <= 9999999.99 && /^\d+(\.\d{1,2})?$/.test(String(value).trim());

export function validateProduct(form, creating) {
  const e = {};
  if (form.name.trim().length < 2) e.name = "Enter the product name (at least 2 characters).";
  if (form.sku.trim().length < 2) e.sku = "Enter a SKU (at least 2 characters).";
  else if (!SKU_RE.test(form.sku.trim())) e.sku = "Use letters, numbers and - _ / . only.";
  if (!form.category_id) e.category_id = "Choose a category.";
  if (!validMoney(form.cost_price)) e.cost_price = "Enter an amount like 120 or 120.50.";
  if (!validMoney(form.sell_price)) e.sell_price = "Enter an amount like 150 or 149.99.";
  if (!isWholeNumber(form.reorder_level) || Number(form.reorder_level) < 0) e.reorder_level = "Enter a whole number, 0 or more.";
  if (creating && (!isWholeNumber(form.opening_stock) || Number(form.opening_stock) < 0)) e.opening_stock = "Enter a whole number, 0 or more.";
  return e;
}

// Create or edit a product in a side drawer. Admins only (the page hides the buttons for staff).
export default function ProductForm({ product, onClose, onSaved }) {
  const toast = useToast();
  const creating = !product;
  const [form, setForm] = useState(product ? fromProduct(product) : blank);
  const [errors, setErrors] = useState({});
  const [general, setGeneral] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null); // "archive" | "delete"
  const categories = useLoad(() => api.categories(), []);
  const suppliers = useLoad(() => api.suppliers(), []);

  const set = (key) => (event) => {
    setForm((f) => ({ ...f, [key]: event.target.value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const margin = marginPercent(form.cost_price, form.sell_price);

  const submit = async (event) => {
    event.preventDefault();
    const found = validateProduct(form, creating);
    setErrors(found);
    setGeneral("");
    if (Object.keys(found).length) return;

    const body = {
      name: form.name, sku: form.sku, category_id: Number(form.category_id),
      supplier_id: form.supplier_id ? Number(form.supplier_id) : undefined,
      unit: form.unit, cost_price: Number(form.cost_price), sell_price: Number(form.sell_price),
      reorder_level: Number(form.reorder_level), location: form.location || undefined,
    };
    setBusy(true);
    try {
      let saved;
      if (creating) {
        saved = await api.createProduct({ ...body, opening_stock: Number(form.opening_stock) });
        toast.success(`${saved.name} added.`);
      } else {
        // PATCH only sends fields that exist; clearing the supplier or shelf must send an explicit null.
        saved = await api.updateProduct(product.id, {
          ...body,
          supplier_id: form.supplier_id ? Number(form.supplier_id) : null,
          location: form.location || null,
        });
        toast.success("Product saved.");
      }
      onSaved(saved);
    } catch (error) {
      const { fields, general: message } = splitError(error);
      setErrors(fields);
      setGeneral(message);
    } finally {
      setBusy(false);
    }
  };

  const runConfirmed = async () => {
    setBusy(true);
    try {
      if (confirm === "delete") {
        await api.deleteProduct(product.id);
        toast.success(`${product.name} deleted.`);
        onSaved(null, "deleted");
      } else {
        const saved = await api.updateProduct(product.id, { is_active: !product.is_active });
        toast.success(product.is_active ? `${product.name} archived.` : `${product.name} restored.`);
        onSaved(saved);
      }
    } catch (error) {
      toast.error(error.message);
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal
        variant="drawer"
        title={creating ? "New product" : "Edit product"}
        subtitle={creating ? "Add an item you buy and sell." : product.sku}
        onClose={onClose}
        onSubmit={submit}
        busy={busy}
        footer={
          <>
            {!creating ? (
              <div className="foot-left">
                <Button size="sm" variant="ghost" icon={product.is_active ? "archive" : "restore"} onClick={() => setConfirm("archive")} disabled={busy}>
                  {product.is_active ? "Archive" : "Restore"}
                </Button>
                <Button size="sm" variant="ghost-danger" icon="trash" onClick={() => setConfirm("delete")} disabled={busy}>
                  Delete
                </Button>
              </div>
            ) : null}
            <Button onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={busy}>
              {creating ? "Add product" : "Save changes"}
            </Button>
          </>
        }
      >
        <FormError message={general} />
        <Field label="Product name" required error={errors.name}>
          <input className="input" value={form.name} onChange={set("name")} maxLength={120} placeholder="e.g. Aashirvaad Atta 5 kg" />
        </Field>
        <FormRow>
          <Field label="SKU" required error={errors.sku} hint="A short unique code. Saved in capitals.">
            <input className="input mono" value={form.sku} onChange={set("sku")} maxLength={30} placeholder="STP-ATA-5" />
          </Field>
          <Field label="Shelf location" error={errors.location}>
            <input className="input" value={form.location} onChange={set("location")} maxLength={40} placeholder="A-01" />
          </Field>
        </FormRow>
        <FormRow>
          <Field label="Category" required error={errors.category_id}>
            <Select value={form.category_id} onChange={set("category_id")}>
              <option value="">Choose…</option>
              {(categories.data || []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Usual supplier" error={errors.supplier_id}>
            <Select value={form.supplier_id} onChange={set("supplier_id")}>
              <option value="">None</option>
              {(suppliers.data || []).map((s) => (
                <option key={s.id} value={s.id} disabled={!s.is_active && String(s.id) !== form.supplier_id}>
                  {s.name}
                  {s.is_active ? "" : " (inactive)"}
                </option>
              ))}
            </Select>
          </Field>
        </FormRow>
        <FormRow>
          <Field label="Unit" required error={errors.unit}>
            <Select value={form.unit} onChange={set("unit")}>
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Reorder level" required error={errors.reorder_level} hint="Warn me when stock falls to this.">
            <input className="input" inputMode="numeric" value={form.reorder_level} onChange={set("reorder_level")} />
          </Field>
        </FormRow>
        <FormRow>
          <Field label="Cost price (₹)" required error={errors.cost_price}>
            <input className="input" inputMode="decimal" value={form.cost_price} onChange={set("cost_price")} placeholder="0.00" />
          </Field>
          <Field label="Selling price (₹)" required error={errors.sell_price}>
            <input className="input" inputMode="decimal" value={form.sell_price} onChange={set("sell_price")} placeholder="0.00" />
          </Field>
        </FormRow>
        {margin !== null && validMoney(form.cost_price) && validMoney(form.sell_price) ? (
          <p className={`preview ${margin < 0 ? "preview-bad" : ""}`}>
            Margin: <strong>{margin.toFixed(1)}%</strong> · {inr(Number(form.sell_price) - Number(form.cost_price))} per {form.unit}
            {margin < 0 ? " (selling below cost)" : ""}
          </p>
        ) : null}
        {creating ? (
          <Field label="Opening stock" error={errors.opening_stock} hint="Quantity already on the shelf. Recorded in the ledger as opening stock.">
            <input className="input" inputMode="numeric" value={form.opening_stock} onChange={set("opening_stock")} />
          </Field>
        ) : (
          <p className="hint">
            Current stock is {product.qty_on_hand} {product.unit}. To change it, use Receive, Issue or Adjust so the ledger stays complete.
          </p>
        )}
      </Modal>

      {confirm ? (
        <ConfirmDialog
          title={confirm === "delete" ? "Delete this product?" : product.is_active ? "Archive this product?" : "Restore this product?"}
          confirmLabel={confirm === "delete" ? "Delete product" : product.is_active ? "Archive" : "Restore"}
          tone={confirm === "delete" ? "danger" : "primary"}
          busy={busy}
          onConfirm={runConfirmed}
          onClose={() => setConfirm(null)}
        >
          {confirm === "delete" ? (
            <p>
              <strong>{product.name}</strong> will be removed for good. Products that already have stock history cannot be deleted. Archive them instead to keep the records.
            </p>
          ) : product.is_active ? (
            <p>
              <strong>{product.name}</strong> will be hidden from lists and cannot receive or issue stock. Its history is kept and you can restore it any time.
            </p>
          ) : (
            <p>
              <strong>{product.name}</strong> will appear in lists again and can receive and issue stock.
            </p>
          )}
        </ConfirmDialog>
      ) : null}
    </>
  );
}
