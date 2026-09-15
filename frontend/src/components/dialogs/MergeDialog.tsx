import { useEffect, useState } from "react";
import { useOpenDocument } from "../../hooks/useOpenDocument";
import { useWorkingDocument } from "../../hooks/useWorkingDocument";
import { formatBytes } from "../../lib/format";
import Button from "../ui/Button";
import Dialog from "../ui/Dialog";
import Spinner from "../ui/Spinner";

/** Real Merge flow: picks another of the user's own `ready` documents and
 * calls POST .../operations/merge, which splices that document's current
 * pages into this one's working copy — a real page count increase, not a
 * link or a reference. */
export default function MergeDialog() {
  const working = useWorkingDocument();
  const { document: doc, recentDocuments, refreshRecent } = useOpenDocument();
  const [targetId, setTargetId] = useState<string | null>(null);
  const [position, setPosition] = useState<"before" | "after">("after");

  useEffect(() => {
    if (working.mergeDialogOpen) void refreshRecent();
  }, [working.mergeDialogOpen, refreshRecent]);

  const candidates = recentDocuments.filter((d) => d.id !== doc?.id && d.status === "ready");

  return (
    <Dialog open={working.mergeDialogOpen} onClose={working.closeMergeDialog} title="Merge document">
      <div className="flex flex-col gap-4">
        {candidates.length === 0 ? (
          <p className="text-xs text-text-subtle">
            No other ready documents to merge. Open or upload another document first.
          </p>
        ) : (
          <ul className="flex max-h-52 flex-col gap-0.5 overflow-y-auto">
            {candidates.map((candidate) => (
              <li key={candidate.id}>
                <button
                  type="button"
                  onClick={() => setTargetId(candidate.id)}
                  aria-pressed={targetId === candidate.id}
                  className={[
                    "flex w-full flex-col items-start gap-0.5 rounded-md border px-2 py-1.5 text-left",
                    targetId === candidate.id
                      ? "border-accent bg-accent-subtle/40"
                      : "border-transparent hover:bg-surface-muted",
                  ].join(" ")}
                >
                  <span className="w-full truncate text-xs text-text">{candidate.filename}</span>
                  <span className="text-[10px] text-text-subtle">
                    {candidate.pageCount ?? "—"} pages · {formatBytes(candidate.sizeBytes)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <fieldset className="flex items-center gap-4 text-xs text-text-muted">
          <legend className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-subtle">
            Position
          </legend>
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={position === "before"} onChange={() => setPosition("before")} />
            Before this document
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={position === "after"} onChange={() => setPosition("after")} />
            After this document
          </label>
        </fieldset>

        {working.busy ? (
          <div className="flex items-center justify-center py-2">
            <Spinner label={working.busyLabel ?? "Merging…"} />
          </div>
        ) : (
          <Button
            variant="primary"
            size="sm"
            disabled={!targetId}
            onClick={() => {
              if (!targetId) return;
              void working.runMerge(targetId, position).then(() => working.closeMergeDialog());
            }}
          >
            Merge
          </Button>
        )}
      </div>
    </Dialog>
  );
}
