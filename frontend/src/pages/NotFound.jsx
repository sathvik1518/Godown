import { ButtonLink, EmptyState, PageHeader } from "../components/ui.jsx";
import { useDocumentTitle } from "../hooks.js";

export default function NotFound() {
  useDocumentTitle("Page not found");
  return (
    <>
      <PageHeader title="Page not found" />
      <section className="card">
        <EmptyState icon="search" title="There is nothing at this address" action={<ButtonLink to="/" variant="primary">Back to the dashboard</ButtonLink>}>
          The link may be old, or the page may have moved.
        </EmptyState>
      </section>
    </>
  );
}
