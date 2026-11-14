import { useState } from "react";
import { api } from "../api.js";
import { useToast } from "../context/Toast.jsx";
import { splitError } from "../utils/forms.js";
import { Field, FormError } from "./Form.jsx";
import { Modal } from "./Modal.jsx";
import { Button } from "./ui.jsx";

export default function PasswordDialog({ onClose }) {
  const toast = useToast();
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [errors, setErrors] = useState({});
  const [general, setGeneral] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key) => (event) => {
    setForm((f) => ({ ...f, [key]: event.target.value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const submit = async (event) => {
    event.preventDefault();
    const found = {};
    if (!form.current) found.current = "Enter your current password.";
    if (form.next.length < 8) found.next = "Use at least 8 characters.";
    else if (!/[A-Za-z]/.test(form.next) || !/[0-9]/.test(form.next)) found.next = "Use at least one letter and one number.";
    if (form.confirm !== form.next) found.confirm = "The two passwords do not match.";
    setErrors(found);
    if (Object.keys(found).length) return;

    setBusy(true);
    setGeneral("");
    try {
      await api.changePassword({ current_password: form.current, new_password: form.next });
      toast.success("Password changed.");
      onClose();
    } catch (error) {
      const { fields, general: message } = splitError(error);
      setErrors({ current: fields.current_password, next: fields.new_password });
      setGeneral(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Change password"
      subtitle="Use at least 8 characters with a letter and a number."
      size="sm"
      onClose={onClose}
      onSubmit={submit}
      busy={busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={busy}>
            Save password
          </Button>
        </>
      }
    >
      <FormError message={general} />
      <Field label="Current password" required error={errors.current}>
        <input className="input" type="password" autoComplete="current-password" value={form.current} onChange={set("current")} />
      </Field>
      <Field label="New password" required error={errors.next}>
        <input className="input" type="password" autoComplete="new-password" value={form.next} onChange={set("next")} />
      </Field>
      <Field label="Confirm new password" required error={errors.confirm}>
        <input className="input" type="password" autoComplete="new-password" value={form.confirm} onChange={set("confirm")} />
      </Field>
    </Modal>
  );
}
