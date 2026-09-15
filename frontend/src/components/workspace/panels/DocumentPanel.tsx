import { useOpenDocument } from "../../../hooks/useOpenDocument";
import { formatBytes, formatDate } from "../../../lib/format";
import { presentDocumentStatus } from "../../../lib/documentStatus";
import Panel from "../../ui/Panel";
import StatusIndicator from "../../ui/StatusIndicator";

/** Shown when there is no selection: document-level metadata. Real values
 * once a document is open (Phase 2's upload/status endpoints) — honest
 * "—" placeholders otherwise, never a fabricated title or page count. */
export default function DocumentPanel() {
  const { document: doc } = useOpenDocument();

  const fields: Array<[string, string]> = doc
    ? [
        ["Title", doc.title],
        ["Pages", doc.pageCount !== null ? String(doc.pageCount) : "—"],
        ["File size", formatBytes(doc.sizeBytes)],
        ["Uploaded", formatDate(doc.createdAt)],
      ]
    : [
        ["Title", "—"],
        ["Pages", "—"],
        ["File size", "—"],
        ["Uploaded", "—"],
      ];

  const status = doc ? presentDocumentStatus(doc.status) : null;

  return (
    <Panel title="Document">
      <dl className="space-y-1.5">
        {fields.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-2 text-xs">
            <dt className="text-text-muted">{label}</dt>
            <dd className="truncate text-text-subtle" title={value}>
              {value}
            </dd>
          </div>
        ))}
        {status && (
          <div className="flex items-center justify-between text-xs">
            <dt className="text-text-muted">Status</dt>
            <dd>
              <StatusIndicator status={status.tone} label={status.label} />
            </dd>
          </div>
        )}
      </dl>
    </Panel>
  );
}
