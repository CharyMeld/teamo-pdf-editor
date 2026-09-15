import { useId, useState } from "react";
import { useOpenDocument } from "../../hooks/useOpenDocument";
import { useWorkingDocument } from "../../hooks/useWorkingDocument";
import Button from "../ui/Button";
import Dialog from "../ui/Dialog";
import Spinner from "../ui/Spinner";

/** Real Save As: POST .../operations save-as wraps the current working
 * state as version 1 of a brand-new, independent document (see
 * ARCHITECTURE.md's Phase 3 (backend) section) — the source document's
 * own pending edits are untouched. */
export default function SaveAsDialog() {
  const working = useWorkingDocument();
  const { document: doc } = useOpenDocument();
  const inputId = useId();
  const [title, setTitle] = useState("");

  const defaultTitle = doc ? `${doc.title} (copy)` : "";

  return (
    <Dialog open={working.saveAsDialogOpen} onClose={working.closeSaveAsDialog} title="Save a copy">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const finalTitle = title.trim() || defaultTitle;
          if (!finalTitle) return;
          void working.saveAs(finalTitle);
        }}
        className="flex flex-col gap-3"
      >
        <label htmlFor={inputId} className="flex flex-col gap-1 text-xs text-text-muted">
          New document title
          <input
            id={inputId}
            type="text"
            value={title}
            placeholder={defaultTitle}
            onChange={(e) => setTitle(e.target.value)}
            disabled={working.busy}
            className="h-8 rounded-md border border-border bg-surface px-2 text-sm text-text disabled:opacity-60"
          />
        </label>
        {working.busy ? (
          <div className="flex items-center justify-center py-2">
            <Spinner label={working.busyLabel ?? "Saving…"} />
          </div>
        ) : (
          <Button type="submit" variant="primary" size="sm">
            Save a copy
          </Button>
        )}
      </form>
    </Dialog>
  );
}
