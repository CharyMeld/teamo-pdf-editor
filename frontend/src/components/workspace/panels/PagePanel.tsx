import { useDocumentViewState } from "../../../hooks/useDocumentViewState";
import { useOpenDocument } from "../../../hooks/useOpenDocument";
import Panel from "../../ui/Panel";

/** Shown while a page is selected (via the dev selection simulator — the
 * ribbon-contextual "selection" concept is still Phase 1 scaffolding, see
 * useSelectionContext). Once a document is actually open, the fields
 * below show the real current page's geometry from
 * GET /api/documents/{id}/pages, not a fabricated placeholder. */
export default function PagePanel() {
  const view = useDocumentViewState();
  const { pages } = useOpenDocument();
  const page = pages.find((p) => p.pageNumber === view.currentPage);

  const fields: Array<[string, string]> = page
    ? [
        ["Page number", String(page.pageNumber)],
        ["Size", `${Math.round(page.widthPt)} × ${Math.round(page.heightPt)} pt`],
        ["Rotation", `${page.rotationDegrees}°`],
      ]
    : [
        ["Page number", view.totalPages > 0 ? String(view.currentPage) : "—"],
        ["Size", "—"],
        ["Rotation", "0°"],
      ];

  return (
    <Panel title="Page">
      <dl className="space-y-1.5">
        {fields.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between text-xs">
            <dt className="text-text-muted">{label}</dt>
            <dd className="text-text-subtle">{value}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}
