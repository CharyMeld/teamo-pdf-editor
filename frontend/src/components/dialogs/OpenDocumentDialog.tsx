import { useRef, useState } from "react";
import { useOpenDocument } from "../../hooks/useOpenDocument";
import { formatBytes, formatDate } from "../../lib/format";
import { presentDocumentStatus } from "../../lib/documentStatus";
import Button from "../ui/Button";
import Dialog from "../ui/Dialog";
import Spinner from "../ui/Spinner";
import StatusIndicator from "../ui/StatusIndicator";

const ACCEPTED_MIME = "application/pdf";

/** The real "Open" flow: upload a PDF from disk, or reopen one already on
 * the backend. Every action here calls a real endpoint — see
 * useOpenDocument (lib/api.ts's uploadDocument/getDocument/listDocuments).
 */
export default function OpenDocumentDialog() {
  const {
    dialogOpen,
    hideOpenDialog,
    uploading,
    uploadError,
    uploadAndOpen,
    openExisting,
    recentDocuments,
  } = useOpenDocument();
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file) void uploadAndOpen(file);
  }

  return (
    <Dialog open={dialogOpen} onClose={hideOpenDialog} title="Open a document">
      <div className="flex flex-col gap-4">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFiles(e.dataTransfer.files);
          }}
          className={[
            "flex flex-col items-center gap-2 rounded-md border-2 border-dashed px-4 py-6 text-center",
            dragOver ? "border-accent bg-accent-subtle/30" : "border-border",
          ].join(" ")}
        >
          {uploading ? (
            <Spinner label="Uploading…" />
          ) : (
            <>
              <p className="text-xs text-text-muted">Drag a PDF here, or</p>
              <Button
                size="sm"
                variant="primary"
                onClick={() => fileInputRef.current?.click()}
              >
                Choose a PDF file
              </Button>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_MIME}
            className="sr-only"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>

        {uploadError && (
          <p role="alert" className="text-xs text-danger">
            {uploadError}
          </p>
        )}

        <div>
          <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-subtle">
            Open recent
          </h3>
          {recentDocuments.length === 0 ? (
            <p className="text-xs text-text-subtle">No documents uploaded yet.</p>
          ) : (
            <ul className="flex max-h-56 flex-col gap-0.5 overflow-y-auto">
              {recentDocuments.map((doc) => {
                const status = presentDocumentStatus(doc.status);
                return (
                  <li key={doc.id}>
                    <button
                      type="button"
                      onClick={() => void openExisting(doc.id)}
                      className="flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-surface-muted"
                    >
                      <span className="w-full truncate text-xs text-text">{doc.filename}</span>
                      <span className="flex items-center gap-2 text-[10px] text-text-subtle">
                        <StatusIndicator status={status.tone} label={status.label} />
                        <span>{formatBytes(doc.sizeBytes)}</span>
                        <span>{formatDate(doc.createdAt)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </Dialog>
  );
}
