import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import {
  cancelOcrJob,
  getOcrJob,
  getOcrLanguages,
  startOcr,
  type OcrJobStatus,
  type OcrJobSummary,
} from "../lib/api";
import { extractErrorMessage } from "../lib/errors";
import { useDocumentViewState } from "../hooks/useDocumentViewState";
import { useOpenDocument } from "../hooks/useOpenDocument";
import { usePageSelection } from "../hooks/usePageSelection";
import { useWorkingDocument } from "../hooks/useWorkingDocument";

const POLL_INTERVAL_MS = 900;

export type OcrScope = "current" | "selected" | "all";

interface OcrWorkflowContextValue {
  dialogOpen: boolean;
  openDialog: () => void;
  closeDialog: () => void;

  resultsOpen: boolean;
  openResults: () => void;
  closeResults: () => void;

  scope: OcrScope;
  setScope: (scope: OcrScope) => void;
  targetPageCount: number;

  languages: string[];
  languagesLoading: boolean;
  language: string;
  setLanguage: (language: string) => void;

  starting: boolean;
  status: OcrJobStatus | null;
  progressPercent: number;
  errorMessage: string | null;
  summary: OcrJobSummary | null;

  start: () => Promise<void>;
  cancel: () => Promise<void>;
}

const OcrWorkflowContext = createContext<OcrWorkflowContextValue | null>(null);

/**
 * Phase 7 (OCR): mirrors `useScanWorkflow`'s shape (dialog-open state +
 * its own async lifecycle) but, unlike scanning, operates on the
 * CURRENTLY-open document — reads `useOpenDocument`/`useWorkingDocument`/
 * `usePageSelection` directly rather than staying independent, since a
 * recognized page is spliced into the same working-copy chain Phase 3/4/5
 * already share (see OcrService's docblock server-side).
 *
 * Progress here is a real percentage polled from `document_jobs.progress_percent`
 * (`RunOcr`/`OcrService`), not a readiness boolean like Phase 3's thumbnail
 * poll — the first job in the app to expose genuine per-page progress.
 * On completion, applies the Phase-3-shaped summary through
 * `working.applyOperationResult` (real undo/redo, thumbnail refresh) and
 * calls `openDocument.reloadPdfDocument()` — the one explicit reload OCR
 * needs since it bakes real text into page content rather than an overlay
 * layer (see `reloadPdfDocument`'s docblock in useOpenDocument).
 */
export function OcrWorkflowProvider({ children }: { children: ReactNode }) {
  const { document: doc, reloadPdfDocument } = useOpenDocument();
  const { pageCount, applyOperationResult } = useWorkingDocument();
  const { selectedPages, selectedCount } = usePageSelection();
  const view = useDocumentViewState();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [scope, setScope] = useState<OcrScope>("current");
  const [languages, setLanguages] = useState<string[]>([]);
  const [languagesLoading, setLanguagesLoading] = useState(false);
  const [language, setLanguage] = useState("eng");
  const [starting, setStarting] = useState(false);
  const [status, setStatus] = useState<OcrJobStatus | null>(null);
  const [progressPercent, setProgressPercent] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [summary, setSummary] = useState<OcrJobSummary | null>(null);

  const jobIdRef = useRef<number | null>(null);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollGenerationRef = useRef(0);

  const stopPolling = useCallback(() => {
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
    pollGenerationRef.current += 1;
  }, []);

  const targetPageCount =
    scope === "all" ? pageCount : scope === "selected" ? selectedCount : view.currentPage > 0 ? 1 : 0;

  const openDialog = useCallback(() => {
    setDialogOpen(true);
    setErrorMessage(null);
    setStatus(null);
    setSummary(null);
    setProgressPercent(0);
    setScope(selectedCount > 0 ? "selected" : "current");
    setLanguagesLoading(true);
    if (doc) {
      getOcrLanguages(doc.id)
        .then((list) => {
          setLanguages(list);
          if (list.length > 0 && !list.includes(language)) setLanguage(list[0]);
        })
        .catch((err: unknown) => setErrorMessage(extractErrorMessage(err, "Couldn't load OCR languages.")))
        .finally(() => setLanguagesLoading(false));
    }
    // Only re-run when the dialog is opened for THIS document — language
    // isn't reset just because the selection count changed while typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, selectedCount]);

  const closeDialog = useCallback(() => setDialogOpen(false), []);
  const openResults = useCallback(() => setResultsOpen(true), []);
  const closeResults = useCallback(() => setResultsOpen(false), []);

  const poll = useCallback(
    (documentId: string, jobId: number) => {
      stopPolling();
      const generation = pollGenerationRef.current;

      const tick = async () => {
        if (pollGenerationRef.current !== generation) return;
        try {
          const job = await getOcrJob(documentId, jobId);
          if (pollGenerationRef.current !== generation) return;
          setStatus(job.status);
          setProgressPercent(job.progressPercent ?? 0);
          setErrorMessage(job.errorMessage);

          if (job.status === "completed" || job.status === "cancelled") {
            if (job.payload) {
              setSummary(job.payload);
              applyOperationResult(job.payload);
              reloadPdfDocument();
            }
            return;
          }
          if (job.status === "failed") return;

          pollTimeoutRef.current = setTimeout(() => void tick(), POLL_INTERVAL_MS);
        } catch (err) {
          if (pollGenerationRef.current !== generation) return;
          setErrorMessage(extractErrorMessage(err, "Lost track of the OCR job's progress."));
        }
      };

      void tick();
    },
    [stopPolling, applyOperationResult, reloadPdfDocument],
  );

  const start = useCallback(async () => {
    if (!doc || starting) return;

    const pages: number[] | "all" =
      scope === "all" ? "all" : scope === "selected" ? selectedPages : view.currentPage > 0 ? [view.currentPage] : [];

    if (pages !== "all" && pages.length === 0) {
      setErrorMessage("No pages to recognize.");
      return;
    }

    setStarting(true);
    setErrorMessage(null);
    setSummary(null);
    setProgressPercent(0);
    setStatus("queued");

    try {
      const { jobId } = await startOcr(doc.id, pages, language);
      jobIdRef.current = jobId;
      poll(doc.id, jobId);
    } catch (err) {
      setErrorMessage(extractErrorMessage(err, "Couldn't start OCR."));
      setStatus(null);
    } finally {
      setStarting(false);
    }
  }, [doc, starting, scope, selectedPages, view.currentPage, language, poll]);

  const cancel = useCallback(async () => {
    if (!doc || jobIdRef.current === null) return;
    try {
      await cancelOcrJob(doc.id, jobIdRef.current);
    } catch (err) {
      setErrorMessage(extractErrorMessage(err, "Couldn't cancel the OCR job."));
    }
  }, [doc]);

  const value: OcrWorkflowContextValue = {
    dialogOpen,
    openDialog,
    closeDialog,
    resultsOpen,
    openResults,
    closeResults,
    scope,
    setScope,
    targetPageCount,
    languages,
    languagesLoading,
    language,
    setLanguage,
    starting,
    status,
    progressPercent,
    errorMessage,
    summary,
    start,
    cancel,
  };

  return <OcrWorkflowContext.Provider value={value}>{children}</OcrWorkflowContext.Provider>;
}

export function useOcrWorkflow(): OcrWorkflowContextValue {
  const ctx = useContext(OcrWorkflowContext);
  if (!ctx) {
    throw new Error("useOcrWorkflow must be used within an OcrWorkflowProvider");
  }
  return ctx;
}
