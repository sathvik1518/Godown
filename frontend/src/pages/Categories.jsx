import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { Field, FormError } from "../components/Form.jsx";
import { ConfirmDialog, Modal } from "../components/Modal.jsx";
import { Button, EmptyState, ErrorState, IconButton, PageHeader, TableSkeleton } from "../components/ui.jsx";
import { useAuth } from "../context/Auth.jsx";
import { useToast } from "../context/Toast.jsx";
import { useDocumentTitle, useLoad } from "../hooks.js";
import { splitError } from "../utils/forms.js";

function CategoryDialog({ category, onClose, onSaved }) {
  const toast = useToast();
  const creating = !category;
  const [form, setForm] = useState({ name: category?.name || "", description: category?.description || "" });
  const [errors, setErrors] = useState({});
  const [general, setGeneral] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (form.name.trim().length < 2) {
      setErrors({ name: "Enter a name (at least 2 characters)." });
      return;
    }
    setBusy(true);
    setGeneral("");
    try {
      const body = { name: form.name, description: form.description || undefined };
      if (creating) await api.createCategory(body);
      else await api.updateCategory(category.id, body);
      toast.success(creating ? "Category added." : "Category saved.");
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
      title={creating ? "New category" : "Edit category"}
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
            {creating ? "Add category" : "Save"}
          </Button>
        </>
      }
    >
      <FormError message={general} />
      <Field label="Name" required error={errors.name}>
        <input className="input" value={form.name} maxLength={60} onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); setErrors({}); }} />
      </Field>
      <Field label="Description" error={errors.description}>
        <input className="input" value={form.description} maxLength={200} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
      </Field>
    </Modal>
  );
}

export default function Categories() {
  useDocumentTitle("Categories");
  const { isAdmin } = useAuth();
  const toast = useToast();
  const list = useLoad(() => api.categories(), []);
  const [editing, setEditing] = useState(undefined);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const items = list.data || [];

  const remove = async () => {
    setBusy(true);
    try {
      await api.deleteCategory(deleting.id);
      toast.success(`${deleting.name} deleted.`);
      setDeleting(null);
      list.reload();
    } catch (error) {
      toast.error(error.message);
      setDeleting(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Categories" subtitle="Group products so lists and reports are easy to scan.">
        {isAdmin ? (
          <Button variant="primary" icon="plus" onClick={() => setEditing(null)}>
            New category
          </Button>
        ) : null}
      </PageHeader>

      <section className="card" aria-label="Categories">
        {list.error && !list.data ? (
          <ErrorState error={list.error} onRetry={list.reload} />
        ) : list.loading && !list.data ? (
          <TableSkeleton rows={5} cols={3} />
        ) : !items.length ? (
          <EmptyState icon="tag" title="No categories yet">
            Add a category before you add products.
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">Product categories</caption>
              <thead>
                <tr>
                  <th scope="col">Category</th>
                  <th scope="col" className="col-md">Description</th>
                  <th scope="col" className="num">Products</th>
                  <th scope="col" className="actions-col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.name}</strong>
                    </td>
                    <td className="col-md">{c.description || <span className="muted">—</span>}</td>
                    <td className="num">
                      <Link to={`/products?category=${c.id}`}>{c.product_count}</Link>
                    </td>
                    <td className="actions-col">
                      {isAdmin ? (
                        <div className="row-actions">
                          <IconButton icon="edit" label={`Edit ${c.name}`} onClick={() => setEditing(c)} />
                          <IconButton icon="trash" tone="danger" label={`Delete ${c.name}`} onClick={() => setDeleting(c)} />
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editing !== undefined ? (
        <CategoryDialog
          category={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            list.reload();
          }}
        />
      ) : null}
      {deleting ? (
        <ConfirmDialog title="Delete this category?" confirmLabel="Delete" tone="danger" busy={busy} onConfirm={remove} onClose={() => setDeleting(null)}>
          <p>
            <strong>{deleting.name}</strong> will be removed. A category that still has products cannot be deleted. Move those products first.
          </p>
        </ConfirmDialog>
      ) : null}
    </>
  );
}
