import { useState } from "react";
import { api } from "../api.js";
import { Field, FormError, Select } from "../components/Form.jsx";
import { Modal } from "../components/Modal.jsx";
import { Avatar, Button, EmptyState, ErrorState, IconButton, PageHeader, Pill, TableSkeleton } from "../components/ui.jsx";
import { useAuth } from "../context/Auth.jsx";
import { useToast } from "../context/Toast.jsx";
import { useDocumentTitle, useLoad } from "../hooks.js";
import { shortDate } from "../utils/format.js";
import { splitError } from "../utils/forms.js";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

function MemberDialog({ member, isSelf, onClose, onSaved }) {
  const toast = useToast();
  const creating = !member;
  const [form, setForm] = useState({
    name: member?.name || "",
    email: member?.email || "",
    role: member?.role || "staff",
    password: "",
    is_active: member ? member.is_active : true,
  });
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
    if (form.name.trim().length < 2) found.name = "Enter a name (at least 2 characters).";
    if (creating && !EMAIL_RE.test(form.email.trim())) found.email = "Enter a valid email address.";
    if (creating || form.password) {
      if (form.password.length < 8) found.password = "Use at least 8 characters.";
      else if (!/[A-Za-z]/.test(form.password) || !/[0-9]/.test(form.password)) found.password = "Use at least one letter and one number.";
    }
    setErrors(found);
    setGeneral("");
    if (Object.keys(found).length) return;

    setBusy(true);
    try {
      if (creating) {
        await api.createUser({ name: form.name, email: form.email.trim(), password: form.password, role: form.role });
        toast.success(`${form.name} can now sign in.`);
      } else {
        const body = { name: form.name, role: form.role, is_active: form.is_active };
        if (form.password) body.password = form.password;
        await api.updateUser(member.id, body);
        toast.success("Team member saved.");
      }
      onSaved();
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
      title={creating ? "Add team member" : "Edit team member"}
      subtitle={creating ? "They can sign in straight away with this password." : member.email}
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
            {creating ? "Add member" : "Save"}
          </Button>
        </>
      }
    >
      <FormError message={general} />
      <Field label="Full name" required error={errors.name}>
        <input className="input" value={form.name} onChange={set("name")} maxLength={80} />
      </Field>
      {creating ? (
        <Field label="Email" required error={errors.email}>
          <input className="input" type="email" value={form.email} onChange={set("email")} />
        </Field>
      ) : null}
      <Field label="Role" error={errors.role} hint={isSelf ? "You cannot change your own role." : "Admins manage products, suppliers and people. Staff record stock and draft orders."}>
        <Select value={form.role} onChange={set("role")} disabled={isSelf}>
          <option value="staff">Staff</option>
          <option value="admin">Admin</option>
        </Select>
      </Field>
      <Field label={creating ? "Password" : "New password"} required={creating} error={errors.password} hint={creating ? "At least 8 characters with a letter and a number." : "Leave empty to keep the current password."}>
        <input className="input" type="password" autoComplete="new-password" value={form.password} onChange={set("password")} />
      </Field>
      {!creating ? (
        <label className="check">
          <input type="checkbox" checked={form.is_active} disabled={isSelf} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
          Active. Inactive people cannot sign in.
        </label>
      ) : null}
    </Modal>
  );
}

export default function Team() {
  useDocumentTitle("Team");
  const { user } = useAuth();
  const list = useLoad(() => api.users(), []);
  const [editing, setEditing] = useState(undefined);
  const items = list.data || [];

  return (
    <>
      <PageHeader title="Team" subtitle="Who can sign in. There is no public sign-up: admins create every account.">
        <Button variant="primary" icon="plus" onClick={() => setEditing(null)}>
          Add team member
        </Button>
      </PageHeader>

      <section className="card" aria-label="Team members">
        {list.error && !list.data ? (
          <ErrorState error={list.error} onRetry={list.reload} />
        ) : list.loading && !list.data ? (
          <TableSkeleton rows={4} cols={4} />
        ) : !items.length ? (
          <EmptyState icon="users" title="No team members" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">Team members</caption>
              <thead>
                <tr>
                  <th scope="col">Person</th>
                  <th scope="col">Role</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="col-md">Added</th>
                  <th scope="col" className="actions-col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((m) => (
                  <tr key={m.id} className={m.is_active ? "" : "is-archived"}>
                    <td>
                      <div className="person">
                        <Avatar name={m.name} />
                        <div>
                          <strong>
                            {m.name}
                            {m.id === user.id ? <span className="muted"> (you)</span> : null}
                          </strong>
                          <span className="cell-sub">{m.email}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <Pill tone={m.role === "admin" ? "info" : "neutral"}>{m.role === "admin" ? "Admin" : "Staff"}</Pill>
                    </td>
                    <td>
                      <Pill tone={m.is_active ? "good" : "bad"} dot>
                        {m.is_active ? "Active" : "Inactive"}
                      </Pill>
                    </td>
                    <td className="col-md">{shortDate(m.created_at)}</td>
                    <td className="actions-col">
                      <div className="row-actions">
                        <IconButton icon="edit" label={`Edit ${m.name}`} onClick={() => setEditing(m)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editing !== undefined ? (
        <MemberDialog
          member={editing}
          isSelf={editing?.id === user.id}
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
