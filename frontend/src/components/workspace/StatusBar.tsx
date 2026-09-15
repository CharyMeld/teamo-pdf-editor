import { useEffect, useId, useState } from "react";
import { useDocumentViewState } from "../../hooks/useDocumentViewState";
import { useOpenDocument } from "../../hooks/useOpenDocument";
import { usePanelVisibility } from "../../hooks/usePanelVisibility";
import { useWorkingDocument } from "../../hooks/useWorkingDocument";
import { BREAKPOINTS, useMediaQuery } from "../../hooks/useMediaQuery";
import { checkHealth } from "../../lib/api";
import { presentDocumentStatus } from "../../lib/documentStatus";
import IconButton from "../ui/IconButton";
import StatusIndicator from "../ui/StatusIndicator";

/** Real "unsaved changes" + last-operation-result feedback — driven by
 * useWorkingDocument's canUndo/busy/notice, never decorative. This is
 * Phase 3's "operation status" requirement: every ORGANIZE action shows a
 * real in-progress state while it runs and a real success/error message
 * when it settles. */
function OrganizeStatus() {
  const { busy, busyLabel, canUndo, notice, dismissNotice } = useWorkingDocument();

  if (busy) {
    return <StatusIndicator status="loading" label={busyLabel ?? "Working…"} />;
  }

  if (notice) {
    return (
      <span className="flex items-center gap-1.5">
        <StatusIndicator status={notice.type === "success" ? "success" : "danger"} label={notice.message} />
        {notice.action && (
          <button
            type="button"
            onClick={notice.action.onClick}
            className="rounded px-1 text-[11px] font-medium text-accent underline-offset-2 hover:underline"
          >
            {notice.action.label}
          </button>
        )}
        <IconButton icon="close" label="Dismiss" size="sm" onClick={dismissNotice} />
      </span>
    );
  }

  if (canUndo) {
    return <StatusIndicator status="warning" label="Unsaved changes" />;
  }

  return null;
}

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

/** A real, direct "go to page N" control — a number input rather than a
 * static label, committed on Enter/blur and clamped to [1, totalPages]. */
function PageJumpInput() {
  const view = useDocumentViewState();
  const [draft, setDraft] = useState(String(view.currentPage));
  const [syncedPage, setSyncedPage] = useState(view.currentPage);
  const id = useId();

  // Adjust local draft state when `currentPage` changes for a reason
  // other than this input (prev/next, thumbnail click, search) — the
  // React-recommended "adjust state during render" pattern, so this
  // doesn't need an Effect just to mirror a value.
  if (view.currentPage !== syncedPage) {
    setSyncedPage(view.currentPage);
    setDraft(String(view.currentPage));
  }

  function commit() {
    const parsed = Number.parseInt(draft, 10);
    if (Number.isFinite(parsed)) view.goToPage(parsed);
    else setDraft(String(view.currentPage));
  }

  return (
    <span className="flex items-center gap-1">
      <label htmlFor={id} className="sr-only">
        Current page
      </label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        disabled={view.totalPages === 0}
        value={view.totalPages === 0 ? "0" : draft}
        onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="h-6 w-9 rounded border border-border bg-surface-muted text-center tabular-nums text-text disabled:cursor-not-allowed disabled:opacity-60"
      />
      <span className="tabular-nums">/ {view.totalPages}</span>
    </span>
  );
}

function DocumentSearch() {
  const { document: doc, searchQuery, setSearchQuery, searchIndexState, searchMatches, totalMatchOccurrences, goToNextMatch, goToPrevMatch } =
    useOpenDocument();
  const searchId = useId();

  const disabled = !doc || doc.status !== "ready";
  const placeholder =
    !doc || doc.status !== "ready"
      ? "Search document (open a document first)"
      : searchIndexState === "no-text"
        ? "No searchable text in this document"
        : searchIndexState === "building"
          ? "Indexing document text…"
          : "Search document";

  return (
    <div className="flex w-full max-w-64 items-center gap-1">
      <label htmlFor={searchId} className="sr-only">
        Search document
      </label>
      <input
        id={searchId}
        type="text"
        disabled={disabled || searchIndexState === "no-text"}
        placeholder={placeholder}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") goToNextMatch();
        }}
        className="h-6 w-full min-w-0 rounded border border-border bg-surface-muted px-2 text-[11px] text-text placeholder:text-text-subtle disabled:cursor-not-allowed disabled:opacity-60"
      />
      {searchQuery.trim() !== "" && searchIndexState === "ready" && (
        <span className="flex shrink-0 items-center gap-0.5">
          <span className="tabular-nums text-[10px] text-text-subtle">
            {searchMatches.length === 0 ? "0" : totalMatchOccurrences}
          </span>
          <IconButton icon="prev" label="Previous match" size="sm" onClick={goToPrevMatch} disabled={searchMatches.length === 0} />
          <IconButton icon="next" label="Next match" size="sm" onClick={goToNextMatch} disabled={searchMatches.length === 0} />
        </span>
      )}
    </div>
  );
}

/** BOTTOM bar: page position/navigation, zoom, fit mode, document search,
 * document status, and (on tablet/mobile) the panel-drawer toggles — all
 * wired to real state (useDocumentViewState / useOpenDocument). Page
 * navigation is disabled purely because `totalPages` is genuinely 0 until
 * a document is open. */
export default function StatusBar() {
  const view = useDocumentViewState();
  const { document: doc } = useOpenDocument();
  const isTablet = useMediaQuery(BREAKPOINTS.tablet);
  const { toggleThumbnail, toggleInspector, thumbnailOpen, inspectorOpen } = usePanelVisibility();

  const docStatus = doc ? presentDocumentStatus(doc.status) : null;

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
          <PageJumpInput />
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
        <DocumentSearch />
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <OrganizeStatus />
        {docStatus && <StatusIndicator status={docStatus.tone} label={docStatus.label} />}
        <BackendConnection />
      </div>
    </footer>
  );
}
