import { usePanelVisibility } from "../../hooks/usePanelVisibility";
import { BREAKPOINTS, useMediaQuery } from "../../hooks/useMediaQuery";
import EmptyState from "../ui/EmptyState";
import IconButton from "../ui/IconButton";

/** LEFT pane: the real page-thumbnail panel architecture — a scrollable
 * list container with an honest empty state. Once the Pages module ships,
 * a `documents.currentVersion.pages.map(page => <ThumbnailItem .../>)`
 * list replaces the EmptyState below; no fake gray boxes stand in for
 * pages until real thumbnails exist. On tablet/mobile this renders as an
 * off-canvas drawer instead of a docked pane. */
export default function ThumbnailPanel() {
  const isTablet = useMediaQuery(BREAKPOINTS.tablet);
  const { thumbnailOpen, closeThumbnail } = usePanelVisibility();

  const body = (
    <div className="flex h-full flex-col overflow-y-auto bg-surface-muted">
      {/* Future: documents.currentVersion.pages.map(page => <ThumbnailItem key={page.id} page={page} />) */}
      <EmptyState icon="document" title="No document open" description="Thumbnails appear here once a document is loaded." />
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
