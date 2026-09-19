import { useState } from "react";
import { useDocumentLibrary } from "../../documents/useDocumentLibrary";
import { useOpenDocument } from "../../hooks/useOpenDocument";
import { documentDownloadUrl, type DocumentSummary } from "../../lib/api";
import { formatBytes, formatDate } from "../../lib/format";
import { presentLifecycleState } from "../../lib/documentStatus";
import Button from "../ui/Button";
import Dialog from "../ui/Dialog";
import IconButton from "../ui/IconButton";
import Spinner from "../ui/Spinner";
import StatusIndicator from "../ui/StatusIndicator";

/** One document row — local title-draft state for the inline rename
 * (blur-to-commit, the same convention TextObjectPanel already uses)
 * and a two-click arm/confirm for Delete: deleting a whole document
 * (all its versions/history) is materially higher-stakes than this
 * app's existing single-object deletes, which commit immediately with
 * no confirmation anywhere else in the app. */
function DocumentRow({ doc }: { doc: DocumentSummary }) {
  const { busyId, rename, remove, duplicate, archive, unarchive } = useDocumentLibrary();
  const { openExisting, hideOpenDialog } = useOpenDocument();
  const [title, setTitle] = useState(doc.title);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const busy = busyId === doc.id;
  const lifecycle = presentLifecycleState(doc.lifecycleState);

  function commitTitle() {
    const trimmed = title.trim();
    if (trimmed !== "" && trimmed !== doc.title) void rename(doc.id, trimmed);
    else setTitle(doc.title);
  }

  return (
    <li className="flex flex-col gap-1.5 rounded-md border border-border px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <input
          type="text"
          value={title}
          disabled={busy}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm text-text hover:border-border focus:border-border-strong"
        />
        <StatusIndicator status={lifecycle.tone} label={lifecycle.label} />
      </div>

      <div className="flex items-center justify-between gap-2 text-[10px] text-text-subtle">
        <span className="truncate">{doc.filename}</span>
        <span className="flex shrink-0 items-center gap-2">
          <span>{formatBytes(doc.sizeBytes)}</span>
          <span>{formatDate(doc.updatedAt)}</span>
        </span>
      </div>

      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="primary"
          disabled={busy}
          onClick={() => {
            void openExisting(doc.id);
            hideOpenDialog();
          }}
        >
          Open
        </Button>
        <IconButton
          icon="duplicate"
          label="Duplicate"
          size="sm"
          disabled={busy}
          onClick={() => void duplicate(doc.id)}
        />
        <a href={documentDownloadUrl(doc.id)} onClick={(e) => busy && e.preventDefault()}>
          <Button size="sm" variant="secondary" disabled={busy}>
            Download
          </Button>
        </a>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy || (doc.status !== "ready" && doc.status !== "archived")}
          onClick={() => void (doc.status === "archived" ? unarchive(doc.id) : archive(doc.id))}
        >
          {doc.status === "archived" ? "Unarchive" : "Archive"}
        </Button>
        {confirmingDelete ? (
          <>
            <Button size="sm" variant="danger" disabled={busy} onClick={() => void remove(doc.id)}>
              Confirm delete
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmingDelete(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <IconButton
            icon="trash"
            label="Delete"
            size="sm"
            disabled={busy}
            onClick={() => setConfirmingDelete(true)}
          />
        )}
        {busy && <Spinner size={14} label="Working…" />}
      </div>
    </li>
  );
}

/** Phase 13's document-management surface — search, rename, delete,
 * duplicate, download, archive/unarchive. Distinct from the existing
 * `OpenDocumentDialog`'s "Open recent" quick-pick (that stays a fast,
 * unsearchable list); this is the fuller view the ribbon's `home.recent`
 * command is for. */
export default function RecentDocumentsDialog() {
  const { dialogOpen, closeDialog, documents, loading, error, searchQuery, setSearchQuery } = useDocumentLibrary();

  return (
    <Dialog open={dialogOpen} onClose={closeDialog} title="Recent Documents" size="lg">
      <div className="flex flex-col gap-3">
        <input
          type="text"
          placeholder="Search by title or filename…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="rounded border border-border bg-bg px-2 py-1.5 text-sm text-text"
        />

        {error && <p className="rounded bg-danger-subtle px-2 py-1.5 text-xs text-danger">{error}</p>}

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner size={20} label="Loading documents…" />
          </div>
        ) : documents.length === 0 ? (
          <p className="py-6 text-center text-xs text-text-subtle">
            {searchQuery ? "No documents match that search." : "No documents yet."}
          </p>
        ) : (
          <ul className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
            {documents.map((doc) => (
              <DocumentRow key={doc.id} doc={doc} />
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
