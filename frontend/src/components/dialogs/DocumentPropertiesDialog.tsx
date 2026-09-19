import { useEffect } from "react";
import { useDocumentLibrary } from "../../documents/useDocumentLibrary";
import { useOpenDocument } from "../../hooks/useOpenDocument";
import { formatBytes, formatDate } from "../../lib/format";
import { presentLifecycleState } from "../../lib/documentStatus";
import Dialog from "../ui/Dialog";
import Spinner from "../ui/Spinner";
import StatusIndicator from "../ui/StatusIndicator";

/**
 * Phase 13's "Document Properties" — metadata for the *currently
 * open* document plus its real Version History and Processing
 * History (DocumentVersion/DocumentJob rows every prior phase already
 * produces — see DocumentController::versions()/history()).
 */
export default function DocumentPropertiesDialog() {
  const { document: doc } = useOpenDocument();
  const { propertiesOpen, closeProperties, versions, history, propertiesLoading, loadProperties } =
    useDocumentLibrary();

  useEffect(() => {
    if (propertiesOpen && doc) void loadProperties(doc.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertiesOpen, doc?.id]);

  if (!doc) return null;
  const lifecycle = presentLifecycleState(doc.lifecycleState);

  return (
    <Dialog open={propertiesOpen} onClose={closeProperties} title="Document Properties">
      <div className="flex flex-col gap-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
          <dt className="text-text-muted">Title</dt>
          <dd className="text-text">{doc.title}</dd>
          <dt className="text-text-muted">File name</dt>
          <dd className="truncate text-text">{doc.filename}</dd>
          <dt className="text-text-muted">Type</dt>
          <dd className="text-text">{doc.mimeType}</dd>
          <dt className="text-text-muted">Size</dt>
          <dd className="text-text">{formatBytes(doc.sizeBytes)}</dd>
          <dt className="text-text-muted">Pages</dt>
          <dd className="text-text">{doc.pageCount ?? "—"}</dd>
          <dt className="text-text-muted">Created</dt>
          <dd className="text-text">{formatDate(doc.createdAt)}</dd>
          <dt className="text-text-muted">Updated</dt>
          <dd className="text-text">{formatDate(doc.updatedAt)}</dd>
          <dt className="text-text-muted">State</dt>
          <dd>
            <StatusIndicator status={lifecycle.tone} label={lifecycle.label} />
          </dd>
        </dl>

        {propertiesLoading ? (
          <div className="flex items-center justify-center py-4">
            <Spinner size={18} label="Loading history…" />
          </div>
        ) : (
          <>
            <div>
              <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-subtle">
                Version History
              </h3>
              {versions.length === 0 ? (
                <p className="text-xs text-text-subtle">No saved versions yet.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {versions.map((v) => (
                    <li key={v.versionNumber} className="flex items-center justify-between text-xs text-text">
                      <span>
                        Version {v.versionNumber}
                        {v.isCurrent ? " (current)" : ""}
                      </span>
                      <span className="text-text-subtle">
                        {formatBytes(v.sizeBytes)} · {formatDate(v.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-subtle">
                Processing History
              </h3>
              {history.length === 0 ? (
                <p className="text-xs text-text-subtle">No processing jobs recorded.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {history.map((h, i) => (
                    <li key={i} className="flex items-center justify-between text-xs text-text">
                      <span>{h.jobType}</span>
                      <span className="text-text-subtle">
                        {h.status} · {formatDate(h.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
