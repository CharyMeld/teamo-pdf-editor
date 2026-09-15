import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type FitMode = "none" | "page" | "width";

const ZOOM_MIN = 25;
const ZOOM_MAX = 400;
const ZOOM_STEP = 25;
const DEFAULT_ZOOM = 100;

interface DocumentViewState {
  currentPage: number;
  totalPages: number;
  zoomPercent: number;
  fitMode: FitMode;
}

interface DocumentViewContextValue extends DocumentViewState {
  zoomIn: () => void;
  zoomOut: () => void;
  setFitMode: (mode: FitMode) => void;
  goToNextPage: () => void;
  goToPrevPage: () => void;
  canGoNext: boolean;
  canGoPrev: boolean;
}

const DocumentViewContext = createContext<DocumentViewContextValue | null>(null);

/**
 * Real client-side view state for the workspace: zoom, fit mode, and page
 * position. `totalPages` is 0 in Phase 1 because no document is ever opened
 * yet (see ARCHITECTURE.md) — page navigation is therefore correctly
 * disabled by genuine boundary checks, not styled to look disabled.
 */
export function DocumentViewProvider({ children }: { children: ReactNode }) {
  const [currentPage] = useState(0);
  const [totalPages] = useState(0);
  const [zoomPercent, setZoomPercent] = useState(DEFAULT_ZOOM);
  const [fitMode, setFitModeState] = useState<FitMode>("none");

  const value = useMemo<DocumentViewContextValue>(() => {
    const canGoNext = totalPages > 0 && currentPage < totalPages;
    const canGoPrev = totalPages > 0 && currentPage > 1;
    return {
      currentPage,
      totalPages,
      zoomPercent,
      fitMode,
      canGoNext,
      canGoPrev,
      zoomIn: () => {
        setFitModeState("none");
        setZoomPercent((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP));
      },
      zoomOut: () => {
        setFitModeState("none");
        setZoomPercent((z) => Math.max(ZOOM_MIN, z - ZOOM_STEP));
      },
      setFitMode: (mode: FitMode) => {
        setFitModeState((current) => (current === mode ? "none" : mode));
      },
      goToNextPage: () => {
        // No-op until a document is actually loaded (totalPages === 0);
        // the buttons that call this are disabled in that case anyway.
      },
      goToPrevPage: () => {
        // Same as above.
      },
    };
  }, [currentPage, totalPages, zoomPercent, fitMode]);

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
