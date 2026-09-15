import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSelectionContext } from "../commands/useSelectionContext";
import { useOpenDocument } from "./useOpenDocument";
import { useWorkingDocument } from "./useWorkingDocument";

interface PageSelectionContextValue {
  selectedPages: number[];
  selectedCount: number;
  isSelected: (pageNumber: number) => boolean;
  /** Real single/multi/range selection: a plain click selects only that
   * page; Ctrl/Cmd+click toggles it into/out of a multi-selection;
   * Shift+click selects the contiguous range from the last-clicked page.
   * This is what ThumbnailItem's onClick calls — not a decorative click
   * handler, the actual selection state the ORGANIZE ribbon and Smart
   * Inspector react to via useSelectionContext. */
  handleClick: (pageNumber: number, event: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => void;
  selectAll: (totalPages: number) => void;
  clearSelection: () => void;
}

const PageSelectionContext = createContext<PageSelectionContextValue | null>(null);

/**
 * Real page-thumbnail selection for Phase 3's ORGANIZE tab. Whenever the
 * selected set becomes non-empty this sets useSelectionContext's
 * SelectionType to "page" — the same mechanism DevSelectionSimulator used
 * to fake in Phase 1, now driven by actual thumbnail clicks (the simulator
 * no longer offers a "page" option, see DevSelectionSimulator). Selection
 * is cleared whenever the open document changes, or after any operation
 * that mutates the working copy's page structure (see the `revision`
 * effect below, driven by useWorkingDocument's pageCount+source identity —
 * page numbers can mean something entirely different after a delete/
 * reorder/insert/duplicate, so keeping a stale selection would be wrong).
 */
export function PageSelectionProvider({ children }: { children: ReactNode }) {
  const { setSelection } = useSelectionContext();
  const { document: doc } = useOpenDocument();
  const { revision } = useWorkingDocument();
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const lastClickedRef = useRef<number | null>(null);

  const clearSelection = useCallback(() => {
    setSelectedPages([]);
    lastClickedRef.current = null;
  }, []);

  // A different document opened — the old selection's page numbers are
  // meaningless here.
  useEffect(() => {
    clearSelection();
  }, [doc?.id, clearSelection]);

  // Any operation that mutates the working copy's page structure
  // (delete/reorder/duplicate/rotate/crop/insert/replace/merge/undo/redo)
  // can change what a given page number refers to — clearing here is the
  // safe default (see useWorkingDocument's `revision` docblock).
  useEffect(() => {
    clearSelection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision]);

  useEffect(() => {
    setSelection(selectedPages.length > 0 ? "page" : "none");
    // Only react to a real change in "is anything selected" — setSelection
    // is idempotent for an unchanged value, so this is safe to run on every
    // selectedPages update without extra guarding.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPages.length]);

  const handleClick = useCallback(
    (pageNumber: number, event: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => {
      if (event.shiftKey && lastClickedRef.current !== null) {
        const start = Math.min(lastClickedRef.current, pageNumber);
        const end = Math.max(lastClickedRef.current, pageNumber);
        const range: number[] = [];
        for (let n = start; n <= end; n++) range.push(n);
        setSelectedPages(range);
        return;
      }

      if (event.ctrlKey || event.metaKey) {
        setSelectedPages((prev) =>
          prev.includes(pageNumber) ? prev.filter((n) => n !== pageNumber) : [...prev, pageNumber].sort((a, b) => a - b),
        );
        lastClickedRef.current = pageNumber;
        return;
      }

      setSelectedPages([pageNumber]);
      lastClickedRef.current = pageNumber;
    },
    [],
  );

  const selectAll = useCallback((totalPages: number) => {
    setSelectedPages(Array.from({ length: totalPages }, (_, i) => i + 1));
  }, []);

  const value: PageSelectionContextValue = {
    selectedPages,
    selectedCount: selectedPages.length,
    isSelected: (pageNumber: number) => selectedPages.includes(pageNumber),
    handleClick,
    selectAll,
    clearSelection,
  };

  return <PageSelectionContext.Provider value={value}>{children}</PageSelectionContext.Provider>;
}

export function usePageSelection(): PageSelectionContextValue {
  const ctx = useContext(PageSelectionContext);
  if (!ctx) {
    throw new Error("usePageSelection must be used within a PageSelectionProvider");
  }
  return ctx;
}
