import { useId, useRef, useState } from "react";
import { usePageSelection } from "../../hooks/usePageSelection";
import { useWorkingDocument } from "../../hooks/useWorkingDocument";
import Button from "../ui/Button";
import Dialog from "../ui/Dialog";
import Spinner from "../ui/Spinner";

const ACCEPTED_MIME = "application/pdf";

/** Real Insert flow: either a genuine blank page (POST .../operations/
 * insert with source:"blank") or a page pulled from an uploaded PDF
 * (source:"upload", multipart) — both hit the qpdf-backed endpoint, never
 * a client-side page fabrication. Position defaults to after the last
 * selected page, or the end of the document if nothing is selected. */
export default function InsertPageDialog() {
  const working = useWorkingDocument();
  const { selectedPages } = usePageSelection();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const positionId = useId();

  const defaultAfter = selectedPages.length > 0 ? Math.max(...selectedPages) : working.pageCount;
  const [afterPage, setAfterPage] = useState(defaultAfter);

  function handleFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    void working.runInsertUpload(afterPage, file).then(() => working.closeInsertDialog());
  }

  return (
    <Dialog open={working.insertDialogOpen} onClose={working.closeInsertDialog} title="Insert page">
      <div className="flex flex-col gap-4">
        <label htmlFor={positionId} className="flex flex-col gap-1 text-xs text-text-muted">
          Insert after page
          <input
            id={positionId}
            type="number"
            min={0}
            max={working.pageCount}
            value={afterPage}
            onChange={(e) => setAfterPage(Math.max(0, Math.min(working.pageCount, Number(e.target.value))))}
            className="h-8 w-24 rounded-md border border-border bg-surface px-2 text-sm text-text"
          />
        </label>

        {working.busy ? (
          <div className="flex items-center justify-center py-4">
            <Spinner label={working.busyLabel ?? "Inserting…"} />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                void working.runInsertBlank(afterPage).then(() => working.closeInsertDialog());
              }}
            >
              Insert blank page
            </Button>
            <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
              Insert from PDF file…
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_MIME}
              className="sr-only"
              onChange={(e) => handleFile(e.target.files)}
            />
          </div>
        )}
      </div>
    </Dialog>
  );
}
