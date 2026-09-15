import { useEffect, useId, useState } from "react";
import { useDocumentViewState } from "../../hooks/useDocumentViewState";
import { usePanelVisibility } from "../../hooks/usePanelVisibility";
import { BREAKPOINTS, useMediaQuery } from "../../hooks/useMediaQuery";
import { checkHealth } from "../../lib/api";
import IconButton from "../ui/IconButton";
import StatusIndicator from "../ui/StatusIndicator";

type ConnectionState = "checking" | "connected" | "unreachable";

function BackendConnection() {
  const [connection, setConnection] = useState<ConnectionState>("checking");

  useEffect(() => {
    let cancelled = false;
    checkHealth()
      .then(() => {
        if (!cancelled) setConnection("connected");
      })
      .catch(() => {
        if (!cancelled) setConnection("unreachable");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (connection === "checking") {
    return <StatusIndicator status="loading" label="Backend: checking…" />;
  }
  return (
    <StatusIndicator
      status={connection === "connected" ? "success" : "danger"}
      label={connection === "connected" ? "Backend: connected" : "Backend: unreachable"}
    />
  );
}

/** BOTTOM bar: page position/navigation, zoom, fit mode, document search,
 * and (on tablet/mobile) the panel-drawer toggles — all wired to real
 * client-side state (useDocumentViewState). Page navigation is correctly
 * disabled because totalPages is genuinely 0 until a document is opened,
 * not styled to merely look disabled. */
export default function StatusBar() {
  const view = useDocumentViewState();
  const isTablet = useMediaQuery(BREAKPOINTS.tablet);
  const { toggleThumbnail, toggleInspector, thumbnailOpen, inspectorOpen } = usePanelVisibility();
  const searchId = useId();

  return (
    <footer className="flex h-8 shrink-0 items-center justify-between gap-3 border-t border-border bg-surface px-2 text-xs text-text-muted">
      <div className="flex min-w-0 items-center gap-2">
        {isTablet && (
          <>
            <IconButton
              icon="panelLeft"
              label="Toggle pages panel"
              active={thumbnailOpen}
              onClick={toggleThumbnail}
              size="sm"
            />
            <IconButton
              icon="panelRight"
              label="Toggle inspector"
              active={inspectorOpen}
              onClick={toggleInspector}
              size="sm"
            />
          </>
        )}

        <div className="flex items-center gap-1">
          <IconButton
            icon="prev"
            label="Previous page"
            size="sm"
            disabled={!view.canGoPrev}
            onClick={view.goToPrevPage}
          />
          <span className="tabular-nums">
            {view.totalPages === 0 ? "0 / 0" : `${view.currentPage} / ${view.totalPages}`}
          </span>
          <IconButton
            icon="next"
            label="Next page"
            size="sm"
            disabled={!view.canGoNext}
            onClick={view.goToNextPage}
          />
        </div>

        <div className="hidden items-center gap-1 sm:flex">
          <IconButton icon="zoomOut" label="Zoom out" size="sm" onClick={view.zoomOut} />
          <span className="w-10 text-center tabular-nums">{view.zoomPercent}%</span>
          <IconButton icon="zoomIn" label="Zoom in" size="sm" onClick={view.zoomIn} />
          <IconButton
            icon="fitPage"
            label="Fit page"
            size="sm"
            active={view.fitMode === "page"}
            onClick={() => view.setFitMode("page")}
          />
          <IconButton
            icon="fitWidth"
            label="Fit width"
            size="sm"
            active={view.fitMode === "width"}
            onClick={() => view.setFitMode("width")}
          />
        </div>
      </div>

      <div className="hidden min-w-0 flex-1 items-center justify-center md:flex">
        <label htmlFor={searchId} className="sr-only">
          Search document
        </label>
        <input
          id={searchId}
          type="text"
          disabled={view.totalPages === 0}
          placeholder="Search document (open a document first)"
          className="h-6 w-full max-w-64 rounded border border-border bg-surface-muted px-2 text-[11px] text-text placeholder:text-text-subtle disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>

      <div className="shrink-0">
        <BackendConnection />
      </div>
    </footer>
  );
}
