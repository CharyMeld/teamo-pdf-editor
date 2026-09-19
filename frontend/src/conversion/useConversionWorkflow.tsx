import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import {
  conversionDownloadUrl,
  convertOfficeToPdf,
  getConversionJob,
  startConversion,
  type ConversionFormat,
  type ConversionJobStatus,
} from "../lib/api";
import { extractErrorMessage } from "../lib/errors";
import { useDocumentViewState } from "../hooks/useDocumentViewState";
import { useOpenDocument } from "../hooks/useOpenDocument";
import { usePageSelection } from "../hooks/usePageSelection";
import { useWorkingDocument } from "../hooks/useWorkingDocument";

const POLL_INTERVAL_MS = 900;

export type ConversionScope = "current" | "selected" | "all";

interface ConversionWorkflowContextValue {
  dialogOpen: boolean;
  format: ConversionFormat | null;
  openDialog: (format: ConversionFormat) => void;
  closeDialog: () => void;

  /** Only meaningful for format "images" — toText/toWord always convert the whole document. */
  scope: ConversionScope;
  setScope: (scope: ConversionScope) => void;
  targetPageCount: number;

  imageFormat: "png" | "jpeg";
  setImageFormat: (format: "png" | "jpeg") => void;

  starting: boolean;
  status: ConversionJobStatus | null;
  progressPercent: number;
  errorMessage: string | null;
  downloadUrl: string | null;

  start: () => Promise<void>;

  /** TO a new PDF (a real .docx Word document) — see OfficeToPdfDialog. */
  officeDialogOpen: boolean;
  openOfficeDialog: () => void;
  closeOfficeDialog: () => void;
  officeUploading: boolean;
  officeError: string | null;
  uploadOffice: (file: File) => Promise<void>;
}

const ConversionWorkflowContext = createContext<ConversionWorkflowContextValue | null>(null);

/**
 * Phase 8 (document conversion) — FROM an existing PDF (PDF -> TXT /
 * Images / Word). Mirrors `useOcrWorkflow`'s shape (reads
 * `useOpenDocument`/`useWorkingDocument`/`usePageSelection` directly,
 * real percentage progress polled from `document_jobs`) but simpler: the
 * result is a standalone downloadable file, not a working-copy mutation,
 * so there's no `applyOperationResult`/`reloadPdfDocument` step and no
 * cancel (the brief doesn't ask for conversion cancellation the way it
 * explicitly did for OCR) — completion just exposes a real download URL.
 */
export function ConversionWorkflowProvider({ children }: { children: ReactNode }) {
  const { document: doc, openExisting } = useOpenDocument();
  const { pageCount } = useWorkingDocument();
  const { selectedPages, selectedCount } = usePageSelection();
  const view = useDocumentViewState();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [format, setFormat] = useState<ConversionFormat | null>(null);
  const [scope, setScope] = useState<ConversionScope>("all");
  const [imageFormat, setImageFormat] = useState<"png" | "jpeg">("png");
  const [starting, setStarting] = useState(false);
  const [status, setStatus] = useState<ConversionJobStatus | null>(null);
  const [progressPercent, setProgressPercent] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const [officeDialogOpen, setOfficeDialogOpen] = useState(false);
  const [officeUploading, setOfficeUploading] = useState(false);
  const [officeError, setOfficeError] = useState<string | null>(null);

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

  const openDialog = useCallback(
    (nextFormat: ConversionFormat) => {
      setDialogOpen(true);
      setFormat(nextFormat);
      setErrorMessage(null);
      setStatus(null);
      setDownloadUrl(null);
      setProgressPercent(0);
      setScope(selectedCount > 0 ? "selected" : "all");
    },
    [selectedCount],
  );

  const closeDialog = useCallback(() => {
    setDialogOpen(false);
    stopPolling();
  }, [stopPolling]);

  const poll = useCallback(
    (documentId: string, jobId: number) => {
      stopPolling();
      const generation = pollGenerationRef.current;

      const tick = async () => {
        if (pollGenerationRef.current !== generation) return;
        try {
          const job = await getConversionJob(documentId, jobId);
          if (pollGenerationRef.current !== generation) return;
          setStatus(job.status);
          setProgressPercent(job.progressPercent ?? 0);
          setErrorMessage(job.errorMessage);

          if (job.status === "completed") {
            setDownloadUrl(conversionDownloadUrl(documentId, jobId));
            return;
          }
          if (job.status === "failed") return;

          pollTimeoutRef.current = setTimeout(() => void tick(), POLL_INTERVAL_MS);
        } catch (err) {
          if (pollGenerationRef.current !== generation) return;
          setErrorMessage(extractErrorMessage(err, "Lost track of the conversion's progress."));
        }
      };

      void tick();
    },
    [stopPolling],
  );

  const start = useCallback(async () => {
    if (!doc || !format || starting) return;

    let pages: number[] | "all" | undefined;
    if (format === "images") {
      pages = scope === "all" ? "all" : scope === "selected" ? selectedPages : [view.currentPage];
      if (pages !== "all" && pages.length === 0) {
        setErrorMessage("No pages to convert.");
        return;
      }
    }

    setStarting(true);
    setErrorMessage(null);
    setDownloadUrl(null);
    setProgressPercent(0);
    setStatus("queued");

    try {
      const { jobId } = await startConversion(doc.id, format, pages, format === "images" ? imageFormat : undefined);
      poll(doc.id, jobId);
    } catch (err) {
      setErrorMessage(extractErrorMessage(err, "Couldn't start the conversion."));
      setStatus(null);
    } finally {
      setStarting(false);
    }
  }, [doc, format, starting, scope, selectedPages, view.currentPage, imageFormat, poll]);

  const openOfficeDialog = useCallback(() => {
    setOfficeDialogOpen(true);
    setOfficeError(null);
  }, []);
  const closeOfficeDialog = useCallback(() => setOfficeDialogOpen(false), []);

  const uploadOffice = useCallback(
    async (file: File) => {
      setOfficeUploading(true);
      setOfficeError(null);
      try {
        const document = await convertOfficeToPdf(file);
        await openExisting(document.id);
        setOfficeDialogOpen(false);
      } catch (err) {
        setOfficeError(extractErrorMessage(err, "Couldn't convert that file."));
      } finally {
        setOfficeUploading(false);
      }
    },
    [openExisting],
  );

  const value: ConversionWorkflowContextValue = {
    dialogOpen,
    format,
    openDialog,
    closeDialog,
    scope,
    setScope,
    targetPageCount,
    imageFormat,
    setImageFormat,
    starting,
    status,
    progressPercent,
    errorMessage,
    downloadUrl,
    start,
    officeDialogOpen,
    openOfficeDialog,
    closeOfficeDialog,
    officeUploading,
    officeError,
    uploadOffice,
  };

  return <ConversionWorkflowContext.Provider value={value}>{children}</ConversionWorkflowContext.Provider>;
}

export function useConversionWorkflow(): ConversionWorkflowContextValue {
  const ctx = useContext(ConversionWorkflowContext);
  if (!ctx) {
    throw new Error("useConversionWorkflow must be used within a ConversionWorkflowProvider");
  }
  return ctx;
}
