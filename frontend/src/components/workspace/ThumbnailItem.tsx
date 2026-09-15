import { useState } from "react";
import { documentThumbnailUrl } from "../../lib/api";
import Spinner from "../ui/Spinner";

interface ThumbnailItemProps {
  documentId: string;
  pageNumber: number;
  ready: boolean;
  active: boolean;
  onSelect: (pageNumber: number) => void;
}

/** One real page thumbnail — an `<img>` pointed at the backend's
 * pre-rendered PNG (GET /api/documents/{id}/pages/{n}/thumbnail).
 * `crossOrigin="use-credentials"` is required for the session cookie to
 * ride along on this cross-origin (5173 → 8000) request. While the
 * backend hasn't produced this page's thumbnail yet, or if it genuinely
 * failed, this shows a real loading/error state — never a placeholder
 * image standing in for a page that isn't there. */
export default function ThumbnailItem({
  documentId,
  pageNumber,
  ready,
  active,
  onSelect,
}: ThumbnailItemProps) {
  const [errored, setErrored] = useState(false);

  return (
    <button
      type="button"
      onClick={() => onSelect(pageNumber)}
      aria-current={active}
      className={[
        "flex flex-col items-center gap-1 rounded-md border p-1.5 transition-colors",
        active ? "border-accent bg-accent-subtle/40" : "border-transparent hover:bg-surface",
      ].join(" ")}
    >
      <span className="flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded bg-white shadow-sm">
        {!ready ? (
          <Spinner size={14} label={`Page ${pageNumber} loading`} />
        ) : errored ? (
          <span className="text-[10px] text-danger">Failed</span>
        ) : (
          <img
            src={documentThumbnailUrl(documentId, pageNumber)}
            crossOrigin="use-credentials"
            alt={`Page ${pageNumber}`}
            loading="lazy"
            onError={() => setErrored(true)}
            className="h-full w-full object-contain"
          />
        )}
      </span>
      <span className="text-[10px] text-text-subtle">{pageNumber}</span>
    </button>
  );
}
