import { useState } from "react";
import { usePanelVisibility } from "../../hooks/usePanelVisibility";
import { useDocumentViewState } from "../../hooks/useDocumentViewState";
import { useOpenDocument } from "../../hooks/useOpenDocument";
import { usePageSelection } from "../../hooks/usePageSelection";
import { useWorkingDocument } from "../../hooks/useWorkingDocument";
import { BREAKPOINTS, useMediaQuery } from "../../hooks/useMediaQuery";
import EmptyState from "../ui/EmptyState";
import IconButton from "../ui/IconButton";
import Spinner from "../ui/Spinner";
import ThumbnailItem from "./ThumbnailItem";

interface DropTarget {
  page: number;
  position: "before" | "after";
}

/** Computes the real permutation to send to POST .../operations/reorder:
 * the current 1..N page-position numbers, with `draggedPage` moved to
 * just before/after `target.page`. This is real reordering math — the
 * backend's qpdf engine receives exactly this list and rebuilds the PDF's
 * page order from it (see ARCHITECTURE.md's Phase 3 (backend) section). */
function computeNewOrder(pageCount: number, draggedPage: number, target: DropTarget): number[] {
  const order = Array.from({ length: pageCount }, (_, i) => i + 1);
  const without = order.filter((n) => n !== draggedPage);
  const targetIndex = without.indexOf(target.page);
  const insertAt = target.position === "before" ? targetIndex : targetIndex + 1;
  without.splice(insertAt, 0, draggedPage);
  return without;
}

/** LEFT pane: the real page-thumbnail panel — a scrollable list of the
 * document's actual *working-copy* pages (GET .../working/pages, which
 * falls back to the saved version's real pages when there are no pending
 * edits — see useWorkingDocument), each a real server-rendered thumbnail
 * image. Clicking one navigates the canvas and drives real single/multi/
 * range selection (usePageSelection); dragging one to a new position calls
 * the real reorder endpoint. While the backend's thumbnail job is still
 * running, pages not yet ready show a real loading state, not a
 * placeholder image. On tablet/mobile this renders as an off-canvas drawer
 * instead of a docked pane. */
export default function ThumbnailPanel() {
  const isTablet = useMediaQuery(BREAKPOINTS.tablet);
  const { thumbnailOpen, closeThumbnail } = usePanelVisibility();
  const { document: doc } = useOpenDocument();
  const working = useWorkingDocument();
  const selection = usePageSelection();
  const view = useDocumentViewState();

  const [draggedPage, setDraggedPage] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  const totalPages = working.pageCount;
  const readyPageNumbers = new Set(working.pages.filter((p) => p.thumbnailReady).map((p) => p.pageNumber));
  const dragEnabled = !working.busy && totalPages > 1;

  function handleDrop() {
    if (draggedPage !== null && dropTarget !== null && draggedPage !== dropTarget.page) {
      const newOrder = computeNewOrder(totalPages, draggedPage, dropTarget);
      void working.runReorder(newOrder);
    }
    setDraggedPage(null);
    setDropTarget(null);
  }

  const body = (
    <div className="flex h-full flex-col overflow-y-auto bg-surface-muted">
      {!doc || totalPages === 0 ? (
        <EmptyState
          icon="document"
          title="No document open"
          description="Thumbnails appear here once a document is loaded."
        />
      ) : (
        <>
          {working.thumbnailsPending && (
            <div className="flex items-center gap-1.5 border-b border-dashed border-border-strong px-2 py-1.5 text-[10px] text-text-subtle">
              <Spinner size={10} label="Updating thumbnails" />
              <span>Updating thumbnails…</span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 p-2" onDragLeave={() => setDropTarget(null)}>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNumber) => (
              <ThumbnailItem
                key={pageNumber}
                thumbnailUrl={working.thumbnailUrl(pageNumber)}
                pageNumber={pageNumber}
                ready={readyPageNumbers.has(pageNumber)}
                active={view.currentPage === pageNumber}
                selected={selection.isSelected(pageNumber)}
                onNavigate={view.goToPage}
                onSelectionClick={selection.handleClick}
                draggable={dragEnabled}
                onDragStartPage={setDraggedPage}
                onDragOverPage={(page, beforeMidpoint) =>
                  setDropTarget({ page, position: beforeMidpoint ? "before" : "after" })
                }
                onDropPage={handleDrop}
                onDragEndPage={() => {
                  setDraggedPage(null);
                  setDropTarget(null);
                }}
                dropIndicator={dropTarget?.page === pageNumber ? dropTarget.position : null}
              />
            ))}
          </div>
        </>
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
