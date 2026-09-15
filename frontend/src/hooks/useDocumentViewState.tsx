import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type FitMode = "none" | "page" | "width";

const ZOOM_MIN = 25;
const ZOOM_MAX = 400;
const ZOOM_STEP = 25;
const DEFAULT_ZOOM = 100;

interface DocumentViewState {
  /** The open document's public UUID, or null when nothing is open. */
  documentId: string | null;
  /** Reserved for a future phase that lets the frontend reference a
   * specific version explicitly (see ARCHITECTURE.md's state model) — the
   * backend always operates on "current version" implicitly in Phase 2,
   * so this stays null for now. */
  activeVersionId: number | null;
  currentPage: number;
  totalPages: number;
  zoomPercent: number;
  fitMode: FitMode;
}

interface DocumentViewContextValue extends DocumentViewState {
  openDocument: (documentId: string, totalPages: number) => void;
  closeDocument: () => void;
  setTotalPages: (totalPages: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setZoomPercent: (percent: number) => void;
  /** Updates the *displayed* zoom percentage from a computed Fit
   * Page/Fit Width scale, without touching `fitMode` — unlike
   * `setZoomPercent`, which is the user's explicit manual override and
   * therefore clears the active fit mode. PdfViewer calls this from its
   * resize/fit calculation; nothing else should. */
  syncComputedZoomPercent: (percent: number) => void;
  setFitMode: (mode: FitMode) => void;
  goToNextPage: () => void;
  goToPrevPage: () => void;
  goToPage: (page: number) => void;
  canGoNext: boolean;
  canGoPrev: boolean;
}

const DocumentViewContext = createContext<DocumentViewContextValue | null>(null);

function clampZoom(value: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));
}

/**
 * Real client-side view state for the workspace: which document is open,
 * zoom, fit mode, and page position. Phase 1 kept `totalPages` fixed at 0
 * because no document could ever be opened; Phase 2 makes `openDocument`/
 * `closeDocument`/`setTotalPages`/`goToPage` real, so page navigation is
 * driven by an actually-loaded PDF (see useOpenDocument, which owns the
 * upload/open/unlock lifecycle and calls these setters).
 */
export function DocumentViewProvider({ children }: { children: ReactNode }) {
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPagesState] = useState(0);
  const [zoomPercent, setZoomPercentState] = useState(DEFAULT_ZOOM);
  const [fitMode, setFitModeState] = useState<FitMode>("width");

  const value = useMemo<DocumentViewContextValue>(() => {
    const canGoNext = totalPages > 0 && currentPage < totalPages;
    const canGoPrev = totalPages > 0 && currentPage > 1;
    return {
      documentId,
      activeVersionId: null,
      currentPage,
      totalPages,
      zoomPercent,
      fitMode,
      canGoNext,
      canGoPrev,
      openDocument: (id: string, pages: number) => {
        setDocumentId(id);
        setTotalPagesState(pages);
        setCurrentPage(pages > 0 ? 1 : 0);
      },
      closeDocument: () => {
        setDocumentId(null);
        setTotalPagesState(0);
        setCurrentPage(0);
      },
      setTotalPages: (pages: number) => {
        setTotalPagesState(pages);
        setCurrentPage((page) => (pages === 0 ? 0 : Math.min(Math.max(page, 1), pages)));
      },
      zoomIn: () => {
        setFitModeState("none");
        setZoomPercentState((z) => clampZoom(z + ZOOM_STEP));
      },
      zoomOut: () => {
        setFitModeState("none");
        setZoomPercentState((z) => clampZoom(z - ZOOM_STEP));
      },
      setZoomPercent: (percent: number) => {
        setFitModeState("none");
        setZoomPercentState(clampZoom(percent));
      },
      syncComputedZoomPercent: (percent: number) => {
        setZoomPercentState(clampZoom(Math.round(percent)));
      },
      setFitMode: (mode: FitMode) => {
        setFitModeState((current) => (current === mode ? "none" : mode));
      },
      goToNextPage: () => {
        setCurrentPage((page) => (totalPages > 0 && page < totalPages ? page + 1 : page));
      },
      goToPrevPage: () => {
        setCurrentPage((page) => (totalPages > 0 && page > 1 ? page - 1 : page));
      },
      goToPage: (page: number) => {
        if (totalPages === 0) return;
        setCurrentPage(Math.min(Math.max(1, Math.round(page)), totalPages));
      },
    };
  }, [documentId, currentPage, totalPages, zoomPercent, fitMode]);

  return (
    <DocumentViewContext.Provider value={value}>{children}</DocumentViewContext.Provider>
  );
}

export function useDocumentViewState(): DocumentViewContextValue {
  const ctx = useContext(DocumentViewContext);
  if (!ctx) {
    throw new Error("useDocumentViewState must be used within a DocumentViewProvider");
  }
  return ctx;
}
