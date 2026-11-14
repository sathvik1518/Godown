import { useState } from "react";
import { api } from "../api.js";
import { useToast } from "../context/Toast.jsx";
import { splitError } from "../utils/forms.js";
import { Field, FormError, FormRow } from "./Form.jsx";
import { ConfirmDialog, Modal } from "./Modal.jsx";
import { Button } from "./ui.jsx";

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PHONE_RE = /^[0-9+()\-\s]{7,20}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

const blank = { name: "", contact_person: "", phone: "", email: "", address: "", gstin: "", is_active: true };
const fromSupplier = (s) => ({
  name: s.name, contact_person: s.contact_person || "", phone: s.phone || "", email: s.email || "",
  address: s.address || "", gstin: s.gstin || "", is_active: s.is_active,
});

export function validateSupplier(form) {
  const e = {};
  if (form.name.trim().length < 2) e.name = "Enter the supplier name (at least 2 characters).";
  if (form.phone.trim() && !PHONE_RE.test(form.phone.trim())) e.phone = "Use digits, spaces, + - ( ) only (7 to 20 characters).";
  if (form.email.trim() && !EMAIL_RE.test(form.email.trim())) e.email = "Enter a valid email address.";
  if (form.gstin.trim() && !GSTIN_RE.test(form.gstin.trim().toUpperCase())) e.gstin = "GSTIN has 15 characters, like 36AAKFS4821M1ZP.";
  return e;
}

export default function SupplierForm({ supplier, onClose, onSaved }) {
  const toast = useToast();
  const creating = !supplier;
  const [form, setForm] = useState(supplier ? fromSupplier(supplier) : blank);
  const [errors, setErrors] = useState({});
  const [general, setGeneral] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const set = (key) => (event) => {
    setForm((f) => ({ ...f, [key]: event.target.value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const submit = async (event) => {
    event.preventDefault();
    const found = validateSupplier(form);
    setErrors(found);
    setGeneral("");
    if (Object.keys(found).length) return;
    const body = {
      name: form.name, contact_person: form.contact_person || undefined, phone: form.phone || undefined,
      email: form.email || undefined, address: form.address || undefined,
      gstin: form.gstin ? form.gstin.toUpperCase() : undefined, is_active: form.is_active,
    };
    setBusy(true);
    try {
      const saved = creating ? await api.createSupplier(body) : await api.updateSupplier(supplier.id, body);
      toast.success(creating ? `${saved.name} added.` : "Supplier saved.");
      onSaved(saved);
    } catch (error) {
      const { fields, general: message } = splitError(error);
      setErrors(fields);
      setGeneral(message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.deleteSupplier(supplier.id);
      toast.success(`${supplier.name} deleted.`);
      onSaved(null);
    } catch (error) {
      toast.error(error.message);
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal
        variant="drawer"
        title={creating ? "New supplier" : "Edit supplier"}
        subtitle={creating ? "Someone you buy stock from." : supplier.name}
        onClose={onClose}
        onSubmit={submit}
        busy={busy}
        footer={
          <>
            {!creating ? (
              <div className="foot-left">
                <Button size="sm" variant="ghost-danger" icon="trash" onClick={() => setConfirmDelete(true)} disabled={busy}>
                  Delete
                </Button>
              </div>
            ) : null}
            <Button onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={busy}>
              {creating ? "Add supplier" : "Save changes"}
            </Button>
          </>
        }
      >
        <FormError message={general} />
        <Field label="Supplier name" required error={errors.name}>
          <input className="input" value={form.name} onChange={set("name")} maxLength={120} placeholder="e.g. Sri Venkateswara Traders" />
        </Field>
        <FormRow>
          <Field label="Contact person" error={errors.contact_person}>
            <input className="input" value={form.contact_person} onChange={set("contact_person")} maxLength={80} />
          </Field>
          <Field label="Phone" error={errors.phone}>
            <input className="input" type="tel" value={form.phone} onChange={set("phone")} placeholder="+91 98480 12345" />
          </Field>
        </FormRow>
        <Field label="Email" error={errors.email}>
          <input className="input" type="email" value={form.email} onChange={set("email")} maxLength={160} />
        </Field>
        <Field label="Address" error={errors.address}>
          <textarea className="input" rows={2} value={form.address} onChange={set("address")} maxLength={250} />
        </Field>
        <Field label="GSTIN" error={errors.gstin} hint="15-character GST number. Optional.">
          <input className="input mono" value={form.gstin} onChange={set("gstin")} maxLength={15} placeholder="36AAKFS4821M1ZP" />
        </Field>
        <label className="check">
          <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
          Active. Inactive suppliers cannot receive new orders.
        </label>
      </Modal>
      {confirmDelete ? (
        <ConfirmDialog title="Delete this supplier?" confirmLabel="Delete supplier" tone="danger" busy={busy} onConfirm={remove} onClose={() => setConfirmDelete(false)}>
          <p>
            <strong>{supplier.name}</strong> will be removed. A supplier with products, orders or stock history cannot be deleted. Mark it inactive instead.
          </p>
        </ConfirmDialog>
      ) : null}
    </>
  );
}
