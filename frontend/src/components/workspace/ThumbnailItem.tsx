import { useState } from "react";
import Icon from "../ui/Icon";
import Spinner from "../ui/Spinner";

interface ThumbnailItemProps {
  thumbnailUrl: string;
  pageNumber: number;
  ready: boolean;
  active: boolean;
  selected: boolean;
  /** Real single/ctrl-multi/shift-range selection — see usePageSelection. */
  onSelectionClick: (pageNumber: number, event: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => void;
  /** Navigates the canvas to this page — fires alongside selection on a
   * plain click, same as every desktop PDF app's thumbnail behavior. */
  onNavigate: (pageNumber: number) => void;
  /** Real HTML5 drag-and-drop reordering — Phase 3 (see ThumbnailPanel,
   * which owns the drop-target math and fires the actual reorder API
   * call). Omitted (no drag affordance) while an operation is in flight. */
  draggable: boolean;
  onDragStartPage: (pageNumber: number) => void;
  onDragOverPage: (pageNumber: number, beforeMidpoint: boolean) => void;
  onDropPage: () => void;
  onDragEndPage: () => void;
  dropIndicator: "before" | "after" | null;
}

/** One real page thumbnail — an `<img>` pointed at the backend's
 * pre-rendered PNG (the base version's, or the working copy's current
 * step — ThumbnailPanel decides which URL to pass in). `crossOrigin=
 * "use-credentials"` is required for the session cookie to ride along on
 * this cross-origin (5173 → 8000) request. While the backend hasn't
 * produced this page's thumbnail yet, or if it genuinely failed, this
 * shows a real loading/error state — never a placeholder image standing
 * in for a page that isn't there. */
export default function ThumbnailItem({
  thumbnailUrl,
  pageNumber,
  ready,
  active,
  selected,
  onSelectionClick,
  onNavigate,
  draggable,
  onDragStartPage,
  onDragOverPage,
  onDropPage,
  onDragEndPage,
  dropIndicator,
}: ThumbnailItemProps) {
  const [errored, setErrored] = useState(false);

  return (
    <div className="relative">
      {dropIndicator === "before" && (
        <span className="absolute -top-1.5 left-0 right-0 h-0.5 rounded bg-accent" aria-hidden="true" />
      )}
      <button
        type="button"
        draggable={draggable}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          onDragStartPage(pageNumber);
        }}
        onDragOver={(e) => {
          if (!draggable) return;
          e.preventDefault();
          const rect = e.currentTarget.getBoundingClientRect();
          const beforeMidpoint = e.clientY - rect.top < rect.height / 2;
          onDragOverPage(pageNumber, beforeMidpoint);
        }}
        onDrop={(e) => {
          e.preventDefault();
          onDropPage();
        }}
        onDragEnd={onDragEndPage}
        onClick={(e) => {
          onNavigate(pageNumber);
          onSelectionClick(pageNumber, e);
        }}
        aria-current={active}
        aria-selected={selected}
        className={[
          "flex w-full flex-col items-center gap-1 rounded-md border p-1.5 transition-colors",
          selected
            ? "border-accent bg-accent-subtle/60"
            : active
              ? "border-accent/60 bg-accent-subtle/30"
              : "border-transparent hover:bg-surface",
          draggable ? "cursor-grab active:cursor-grabbing" : "",
        ].join(" ")}
      >
        <span className="flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded bg-white shadow-sm">
          {!ready ? (
            <Spinner size={14} label={`Page ${pageNumber} loading`} />
          ) : errored ? (
            <span className="text-[10px] text-danger">Failed</span>
          ) : (
            <img
              src={thumbnailUrl}
              crossOrigin="use-credentials"
              alt={`Page ${pageNumber}`}
              loading="lazy"
              onError={() => setErrored(true)}
              className="h-full w-full object-contain"
            />
          )}
        </span>
        <span className="flex items-center gap-1 text-[10px] text-text-subtle">
          {selected && <Icon name="drag" size={10} className="text-accent" />}
          {pageNumber}
        </span>
      </button>
      {dropIndicator === "after" && (
        <span className="absolute -bottom-1.5 left-0 right-0 h-0.5 rounded bg-accent" aria-hidden="true" />
      )}
    </div>
  );
}
