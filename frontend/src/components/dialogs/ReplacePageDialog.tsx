import { useRef } from "react";
import { useWorkingDocument } from "../../hooks/useWorkingDocument";
import Button from "../ui/Button";
import Dialog from "../ui/Dialog";
import Spinner from "../ui/Spinner";

const ACCEPTED_MIME = "application/pdf";

/** Real Replace flow: swaps one page's content for a page pulled from an
 * uploaded PDF (POST .../operations/replace, multipart) — the old page's
 * content is genuinely gone from the resulting file, not hidden behind an
 * overlay. */
export default function ReplacePageDialog() {
  const working = useWorkingDocument();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFile(files: FileList | null) {
    const file = files?.[0];
    if (!file || working.replaceTargetPage === null) return;
    void working.runReplace(working.replaceTargetPage, file).then(() => working.closeReplaceDialog());
  }

  return (
    <Dialog open={working.replaceDialogOpen} onClose={working.closeReplaceDialog} title="Replace page">
      <div className="flex flex-col gap-4">
        <p className="text-xs text-text-muted">
          Choose a PDF whose first page will replace page{" "}
          <span className="font-medium text-text">{working.replaceTargetPage ?? "—"}</span>.
        </p>
        {working.busy ? (
          <div className="flex items-center justify-center py-4">
            <Spinner label={working.busyLabel ?? "Replacing…"} />
          </div>
        ) : (
          <>
            <Button variant="primary" size="sm" onClick={() => fileInputRef.current?.click()}>
              Choose a PDF file…
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_MIME}
              className="sr-only"
              onChange={(e) => handleFile(e.target.files)}
            />
          </>
        )}
      </div>
    </Dialog>
  );
}
