import { usePanelVisibility } from "../../hooks/usePanelVisibility";
import { useDocumentViewState } from "../../hooks/useDocumentViewState";
import { useOpenDocument } from "../../hooks/useOpenDocument";
import { BREAKPOINTS, useMediaQuery } from "../../hooks/useMediaQuery";
import EmptyState from "../ui/EmptyState";
import IconButton from "../ui/IconButton";
import ThumbnailItem from "./ThumbnailItem";

/** LEFT pane: the real page-thumbnail panel — a scrollable list of the
 * document's actual pages (from GET /api/documents/{id}/pages), each a
 * real server-rendered thumbnail image. Clicking one jumps the canvas to
 * that page. While the backend's thumbnail job is still running, pages
 * not yet ready show a real loading state, not a placeholder image. On
 * tablet/mobile this renders as an off-canvas drawer instead of a docked
 * pane. */
export default function ThumbnailPanel() {
  const isTablet = useMediaQuery(BREAKPOINTS.tablet);
  const { thumbnailOpen, closeThumbnail } = usePanelVisibility();
  const { document: doc, pages } = useOpenDocument();
  const view = useDocumentViewState();

  const totalPages = doc?.pageCount ?? 0;
  const readyPageNumbers = new Set(pages.filter((p) => p.thumbnailReady).map((p) => p.pageNumber));

  const body = (
    <div className="flex h-full flex-col overflow-y-auto bg-surface-muted">
      {!doc || totalPages === 0 ? (
        <EmptyState
          icon="document"
          title="No document open"
          description="Thumbnails appear here once a document is loaded."
        />
      ) : (
        <div className="grid grid-cols-2 gap-2 p-2">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNumber) => (
            <ThumbnailItem
              key={pageNumber}
              documentId={doc.id}
              pageNumber={pageNumber}
              ready={readyPageNumbers.has(pageNumber)}
              active={view.currentPage === pageNumber}
              onSelect={view.goToPage}
            />
          ))}
        </div>
      )}
    </div>
  );

  if (!isTablet) {
    return (
      <aside className="w-56 shrink-0 border-r border-border">{body}</aside>
    );
  }

  if (!thumbnailOpen) return null;

  return (
    <div className="fixed inset-0 z-30 flex" onClick={closeThumbnail}>
      <div className="absolute inset-0 bg-black/30" />
      <aside
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 flex h-full w-64 flex-col border-r border-border bg-surface shadow-lg"
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-xs font-semibold text-text-muted">Pages</span>
          <IconButton icon="close" label="Close pages panel" onClick={closeThumbnail} size="sm" />
        </div>
        {body}
      </aside>
    </div>
  );
}
