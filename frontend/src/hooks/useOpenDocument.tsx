import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  getDocument,
  getDocumentPages,
  getDocumentStatus,
  listDocuments,
  unlockDocument,
  uploadDocument,
  workingFileUrl,
  type DocumentPageMeta,
  type DocumentSummary,
} from "../lib/api";
import { loadPdfDocument, type PDFDocumentProxy } from "../lib/pdf";
import { devSessionReady } from "../lib/session";
import { useDocumentViewState } from "./useDocumentViewState";

const POLL_INTERVAL_MS = 1200;
const PROCESSING_STATUSES = new Set(["processing", "uploading", "validating"]);

interface SearchMatch {
  pageNumber: number;
  count: number;
}

type SearchIndexState = "idle" | "building" | "ready" | "no-text";

interface OpenDocumentContextValue {
  document: DocumentSummary | null;
  pages: DocumentPageMeta[];
  recentDocuments: DocumentSummary[];
  refreshRecent: () => Promise<void>;

  dialogOpen: boolean;
  showOpenDialog: () => void;
  hideOpenDialog: () => void;

  uploading: boolean;
  uploadError: string | null;
  uploadAndOpen: (file: File) => Promise<void>;
  openExisting: (id: string) => Promise<void>;
  closeDocument: () => void;

  unlocking: boolean;
  unlockError: string | null;
  unlock: (password: string) => Promise<void>;

  pdfDoc: PDFDocumentProxy | null;
  pdfLoadError: string | null;
  /** Re-fetches the real pdf.js document from scratch — for a mutation
   * that bakes changes directly into page content rather than through an
   * overlay layer (Phase 7's OCR is the first: see ARCHITECTURE.md's
   * Phase 7 section on why the load effect below never re-runs on
   * `working.revision`). Also naturally re-runs the search-index effect
   * (same `[pdfDoc, document]` dependency), so "search newly-OCR'd text"
   * falls out of this for free. */
  reloadPdfDocument: () => void;

  /** Real per-page text content from the search index, exposed for Phase
   * 7's OCR-results review/copy/extract — built once, here, from pdf.js's
   * own `getTextContent()`; not a second extraction mechanism. Null while
   * the index hasn't reached that page yet (still building, or out of
   * range). */
  getPageText: (pageNumber: number) => string | null;

  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchIndexState: SearchIndexState;
  searchMatches: SearchMatch[];
  totalMatchOccurrences: number;
  activeMatchPage: number | null;
  goToNextMatch: () => void;
  goToPrevMatch: () => void;
}

const OpenDocumentContext = createContext<OpenDocumentContextValue | null>(null);

/**
 * Owns the whole OPEN → VALIDATE → LOAD → RENDER lifecycle for the
 * currently-open document (Phase 2): upload, status polling while the
 * backend's thumbnail/page job runs, password unlock, loading the real
 * pdf.js document for the canvas, and a client-side text search index
 * built from that same loaded document (see ARCHITECTURE.md's Phase 2
 * section). `useDocumentViewState` stays focused on pure view state
 * (page/zoom/fit) per its own docblock — this hook drives it, it doesn't
 * duplicate it.
 */
export function OpenDocumentProvider({ children }: { children: ReactNode }) {
  const view = useDocumentViewState();

  const [document, setDocument] = useState<DocumentSummary | null>(null);
  const [pages, setPages] = useState<DocumentPageMeta[]>([]);
  const [recentDocuments, setRecentDocuments] = useState<DocumentSummary[]>([]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [pdfLoadError, setPdfLoadError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchIndexState, setSearchIndexState] = useState<SearchIndexState>("idle");
  const [searchIndex, setSearchIndex] = useState<{ pageNumber: number; text: string }[]>([]);
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);

  const passwordRef = useRef<string | undefined>(undefined);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollGenerationRef = useRef(0);
  const indexBuildCancelledRef = useRef(false);

  const stopPolling = useCallback(() => {
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
    pollGenerationRef.current += 1;
  }, []);

  const refreshRecent = useCallback(async () => {
    await devSessionReady;
    const docs = await listDocuments();
    setRecentDocuments(docs);
  }, []);

  const resetDocumentState = useCallback(() => {
    stopPolling();
    indexBuildCancelledRef.current = true;
    passwordRef.current = undefined;
    setDocument(null);
    setPages([]);
    setPdfDoc(null);
    setPdfLoadError(null);
    setSearchQuery("");
    setSearchIndex([]);
    setSearchIndexState("idle");
    setActiveMatchIndex(0);
    setUnlockError(null);
    view.closeDocument();
  }, [stopPolling, view]);

  const loadPagesQuietly = useCallback(async (id: string) => {
    try {
      const list = await getDocumentPages(id);
      setPages(list);
    } catch {
      // Non-fatal — the thumbnail panel just shows fewer ready items;
      // the next poll tick tries again.
    }
  }, []);

  const pollUntilSettled = useCallback(
    (id: string) => {
      stopPolling();
      const generation = ++pollGenerationRef.current;

      const tick = async () => {
        if (pollGenerationRef.current !== generation) return;
        try {
          const summary = await getDocumentStatus(id);
          if (pollGenerationRef.current !== generation) return;
          setDocument(summary);
          view.setTotalPages(summary.pageCount ?? 0);
          await loadPagesQuietly(id);
          if (pollGenerationRef.current !== generation) return;

          if (PROCESSING_STATUSES.has(summary.status)) {
            pollTimeoutRef.current = setTimeout(tick, POLL_INTERVAL_MS);
          }
        } catch {
          if (pollGenerationRef.current === generation) {
            pollTimeoutRef.current = setTimeout(tick, POLL_INTERVAL_MS);
          }
        }
      };

      void tick();
    },
    [loadPagesQuietly, stopPolling, view],
  );

  const openSummary = useCallback(
    async (summary: DocumentSummary, { logOpen }: { logOpen: boolean }) => {
      indexBuildCancelledRef.current = true;
      setDocument(summary);
      setPages([]);
      setPdfDoc(null);
      setPdfLoadError(null);
      setSearchQuery("");
      setSearchIndex([]);
      setSearchIndexState("idle");
      setActiveMatchIndex(0);
      setUnlockError(null);
      passwordRef.current = undefined;
      view.openDocument(summary.id, summary.pageCount ?? 0);

      if (summary.status === "ready") {
        void loadPagesQuietly(summary.id);
      } else if (PROCESSING_STATUSES.has(summary.status)) {
        pollUntilSettled(summary.id);
      }

      if (logOpen) {
        // getDocument (not getDocumentStatus) is what records
        // `document.opened` server-side — see DocumentController::show.
        try {
          const opened = await getDocument(summary.id);
          setDocument(opened);
        } catch {
          // Already have the summary from upload/list; a failed
          // re-fetch here isn't fatal to opening the document.
        }
      }
    },
    [loadPagesQuietly, pollUntilSettled, view],
  );

  const uploadAndOpen = useCallback(
    async (file: File) => {
      setUploading(true);
      setUploadError(null);
      try {
        await devSessionReady;
        const summary = await uploadDocument(file);
        await openSummary(summary, { logOpen: false });
        setDialogOpen(false);
      } catch (error) {
        setUploadError(extractErrorMessage(error, "Upload failed."));
      } finally {
        setUploading(false);
      }
    },
    [openSummary],
  );

  const openExisting = useCallback(
    async (id: string) => {
      setUploadError(null);
      try {
        await devSessionReady;
        const summary = await getDocument(id);
        await openSummary(summary, { logOpen: false });
        setDialogOpen(false);
      } catch (error) {
        setUploadError(extractErrorMessage(error, "Could not open document."));
      }
    },
    [openSummary],
  );

  const unlock = useCallback(
    async (password: string) => {
      if (!document) return;
      setUnlocking(true);
      setUnlockError(null);
      try {
        const summary = await unlockDocument(document.id, password);
        passwordRef.current = password;
        setDocument(summary);
        view.setTotalPages(summary.pageCount ?? 0);
        if (summary.status === "ready") {
          void loadPagesQuietly(summary.id);
        } else if (PROCESSING_STATUSES.has(summary.status)) {
          pollUntilSettled(summary.id);
        }
      } catch (error) {
        setUnlockError(extractErrorMessage(error, "Incorrect password."));
      } finally {
        setUnlocking(false);
      }
    },
    [document, loadPagesQuietly, pollUntilSettled, view],
  );

  // Load the real pdf.js document as soon as the backend says the
  // document is ready — this is what PdfViewer renders from, and what
  // the search index below is built from. One shared instance; nothing
  // else in the app calls getDocument() a second time for the same file.
  // Loads from `workingFileUrl` (the current working-copy step's file, or
  // the saved version if there's no pending step) rather than
  // `documentFileUrl` (always the last SAVE) — identical bytes for every
  // pre-Phase-7 call path (nothing had committed a step without saving
  // when this effect fires), but the one that makes `reloadPdfDocument`
  // actually pick up an OCR job's just-committed text instead of
  // re-fetching the same pre-OCR bytes forever — a real gap found and
  // fixed during Phase 7 browser testing, not assumed.
  const loadPdfDoc = useCallback((): (() => void) => {
    if (!document || document.status !== "ready") return () => {};
    let cancelled = false;

    loadPdfDocument({ url: workingFileUrl(document.id), password: passwordRef.current })
      .promise.then((proxy) => {
        if (cancelled) return;
        setPdfDoc(proxy);
        setPdfLoadError(null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setPdfLoadError(extractErrorMessage(error, "This document could not be rendered."));
      });

    return () => {
      cancelled = true;
    };
  }, [document]);

  useEffect(() => {
    return loadPdfDoc();
    // Re-run only when the open document's identity/status actually
    // changes — not on every render `loadPdfDoc` gets a new identity.
    // A mutation that bakes changes into page content (Phase 7's OCR)
    // instead calls `reloadPdfDocument()` explicitly once its job
    // completes — see that callback's docblock above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document?.id, document?.status]);

  const reloadPdfDocument = useCallback(() => {
    loadPdfDoc();
  }, [loadPdfDoc]);

  // Build a client-side search index from the loaded pdf.js document —
  // real per-page text content, not a fake count. Yields periodically so
  // a 261-page document doesn't jank the canvas while this runs.
  useEffect(() => {
    if (!pdfDoc || !document) return;
    indexBuildCancelledRef.current = false;
    setSearchIndexState("building");
    setSearchIndex([]);

    const pageCount = document.pageCount ?? pdfDoc.numPages;

    (async () => {
      const built: { pageNumber: number; text: string }[] = [];
      let anyText = false;
      for (let n = 1; n <= pageCount; n++) {
        if (indexBuildCancelledRef.current) return;
        try {
          const page = await pdfDoc.getPage(n);
          const content = await page.getTextContent();
          // Collapse whitespace runs to one space: a born-digital PDF
          // usually stores each line as one text item, but Tesseract's
          // `pdf` output (and some other PDF producers) positions every
          // WORD as its own item, each already carrying its own trailing
          // space — joining those with another literal " " compounds into
          // multiple spaces, which a normally-typed multi-word search
          // would then silently miss via plain `indexOf`. Confirmed
          // empirically during Phase 7 testing: a real OCR'd page indexed
          // as "hello   ocr   world" (three spaces) never matched a user
          // typing "hello ocr". Collapsing here (and normalizing the query
          // the same way in `searchMatches`) fixes it for OCR'd pages
          // without changing single-text-item pages' matching at all.
          const text = content.items
            .map((item) => ("str" in item ? item.str : ""))
            .join(" ")
            .toLowerCase()
            .replace(/\s+/g, " ")
            .trim();
          if (text.length > 0) anyText = true;
          built.push({ pageNumber: n, text });
        } catch {
          built.push({ pageNumber: n, text: "" });
        }
        if (n % 8 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
      if (indexBuildCancelledRef.current) return;
      setSearchIndex(built);
      setSearchIndexState(anyText ? "ready" : "no-text");
    })();

    return () => {
      indexBuildCancelledRef.current = true;
    };
  }, [pdfDoc, document]);

  const getPageText = useCallback(
    (pageNumber: number): string | null => {
      const entry = searchIndex.find((e) => e.pageNumber === pageNumber);
      return entry ? entry.text : null;
    },
    [searchIndex],
  );

  const searchMatches = useMemo<SearchMatch[]>(() => {
    // Same whitespace-collapse as the indexed text above, so a normally-
    // typed multi-word query still matches an OCR'd page's irregular
    // per-word spacing.
    const needle = searchQuery.trim().toLowerCase().replace(/\s+/g, " ");
    if (!needle || searchIndexState !== "ready") return [];
    const matches: SearchMatch[] = [];
    for (const { pageNumber, text } of searchIndex) {
      if (!text) continue;
      let count = 0;
      let pos = text.indexOf(needle);
      while (pos !== -1) {
        count++;
        pos = text.indexOf(needle, pos + needle.length);
      }
      if (count > 0) matches.push({ pageNumber, count });
    }
    return matches;
  }, [searchQuery, searchIndex, searchIndexState]);

  useEffect(() => {
    setActiveMatchIndex(0);
  }, [searchQuery]);

  const totalMatchOccurrences = useMemo(
    () => searchMatches.reduce((sum, m) => sum + m.count, 0),
    [searchMatches],
  );

  const activeMatchPage = searchMatches[activeMatchIndex]?.pageNumber ?? null;

  const goToNextMatch = useCallback(() => {
    if (searchMatches.length === 0) return;
    const next = (activeMatchIndex + 1) % searchMatches.length;
    setActiveMatchIndex(next);
    view.goToPage(searchMatches[next].pageNumber);
  }, [activeMatchIndex, searchMatches, view]);

  const goToPrevMatch = useCallback(() => {
    if (searchMatches.length === 0) return;
    const prev = (activeMatchIndex - 1 + searchMatches.length) % searchMatches.length;
    setActiveMatchIndex(prev);
    view.goToPage(searchMatches[prev].pageNumber);
  }, [activeMatchIndex, searchMatches, view]);

  useEffect(() => stopPolling, [stopPolling]);

  const value: OpenDocumentContextValue = {
    document,
    pages,
    recentDocuments,
    refreshRecent,
    dialogOpen,
    showOpenDialog: () => {
      setUploadError(null);
      setDialogOpen(true);
      void refreshRecent();
    },
    hideOpenDialog: () => setDialogOpen(false),
    uploading,
    uploadError,
    uploadAndOpen,
    openExisting,
    closeDocument: resetDocumentState,
    unlocking,
    unlockError,
    unlock,
    pdfDoc,
    pdfLoadError,
    reloadPdfDocument,
    getPageText,
    searchQuery,
    setSearchQuery,
    searchIndexState,
    searchMatches,
    totalMatchOccurrences,
    activeMatchPage,
    goToNextMatch,
    goToPrevMatch,
  };

  return <OpenDocumentContext.Provider value={value}>{children}</OpenDocumentContext.Provider>;
}

export function useOpenDocument(): OpenDocumentContextValue {
  const ctx = useContext(OpenDocumentContext);
  if (!ctx) {
    throw new Error("useOpenDocument must be used within an OpenDocumentProvider");
  }
  return ctx;
}

function extractErrorMessage(error: unknown, fallback: string): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof (error as { response?: unknown }).response === "object"
  ) {
    const response = (error as { response?: { data?: unknown } }).response;
    const data = response?.data as { error?: { message?: string } } | undefined;
    if (data?.error?.message) return data.error.message;
  }
  return fallback;
}
