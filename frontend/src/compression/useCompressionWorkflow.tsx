import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import {
  compressionDownloadUrl,
  getCompressionJob,
  replaceWithCompression,
  startCompression,
  type CompressionCustomOptions,
  type CompressionFormat,
  type CompressionJobStatus,
  type CompressionPreset,
} from "../lib/api";
import { extractErrorMessage } from "../lib/errors";
import { useOpenDocument } from "../hooks/useOpenDocument";
import { useWorkingDocument } from "../hooks/useWorkingDocument";

const POLL_INTERVAL_MS = 900;

const DEFAULT_CUSTOM: Required<CompressionCustomOptions> = {
  imageDpi: 150,
  imageQuality: 75,
  imageFormat: "jpeg",
  subsetFonts: true,
};

interface CompressionWorkflowContextValue {
  dialogOpen: boolean;
  openDialog: (preset: CompressionPreset) => void;
  closeDialog: () => void;

  format: CompressionFormat;
  setFormat: (format: CompressionFormat) => void;
  preset: CompressionPreset;
  setPreset: (preset: CompressionPreset) => void;
  custom: Required<CompressionCustomOptions>;
  setCustom: (custom: Required<CompressionCustomOptions>) => void;
  removeMetadata: boolean;
  setRemoveMetadata: (value: boolean) => void;
  cleanupUnusedObjects: boolean;
  setCleanupUnusedObjects: (value: boolean) => void;

  filename: string | null;
  originalSizeBytes: number | null;
  pageCount: number;

  starting: boolean;
  status: CompressionJobStatus | null;
  progressPercent: number;
  errorMessage: string | null;
  downloadUrl: string | null;
  result: { sizeBytes: number; originalSizeBytes: number; percentReduction: number | null } | null;

  start: () => Promise<void>;
  replacing: boolean;
  replace: () => Promise<void>;
}

const CompressionWorkflowContext = createContext<CompressionWorkflowContextValue | null>(null);

/**
 * Phase 9 (PDF and file compression). Mirrors `useConversionWorkflow`'s
 * shape (reads `useOpenDocument`/`useWorkingDocument` directly, real
 * percentage progress polled from `document_jobs`) but adds one thing
 * conversions don't need: `replace()`, the explicit opt-in that commits
 * the already-produced compressed file into the working copy via
 * `working.applyOperationResult` — reusing the exact same integration
 * point every other mutating operation in this app already uses. By
 * default (no replace), the currently-open document is never touched —
 * see CompressionService's docblock server-side.
 */
export function CompressionWorkflowProvider({ children }: { children: ReactNode }) {
  const { document: doc } = useOpenDocument();
  const { pageCount, applyOperationResult } = useWorkingDocument();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [format, setFormat] = useState<CompressionFormat>("pdf");
  const [preset, setPreset] = useState<CompressionPreset>("balanced");
  const [custom, setCustom] = useState<Required<CompressionCustomOptions>>(DEFAULT_CUSTOM);
  const [removeMetadata, setRemoveMetadata] = useState(false);
  const [cleanupUnusedObjects, setCleanupUnusedObjects] = useState(true);

  const [starting, setStarting] = useState(false);
  const [status, setStatus] = useState<CompressionJobStatus | null>(null);
  const [progressPercent, setProgressPercent] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [result, setResult] = useState<{
    sizeBytes: number;
    originalSizeBytes: number;
    percentReduction: number | null;
  } | null>(null);
  const [replacing, setReplacing] = useState(false);

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

  const openDialog = useCallback((nextPreset: CompressionPreset) => {
    setDialogOpen(true);
    setFormat("pdf");
    setPreset(nextPreset);
    setErrorMessage(null);
    setStatus(null);
    setDownloadUrl(null);
    setResult(null);
    setProgressPercent(0);
  }, []);

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
          const job = await getCompressionJob(documentId, jobId);
          if (pollGenerationRef.current !== generation) return;
          setStatus(job.status);
          setProgressPercent(job.progressPercent ?? 0);
          setErrorMessage(job.errorMessage);

          if (job.status === "completed") {
            if (job.payload) {
              setDownloadUrl(compressionDownloadUrl(documentId, jobId));
              setResult({
                sizeBytes: job.payload.sizeBytes,
                originalSizeBytes: job.payload.originalSizeBytes,
                percentReduction: job.payload.percentReduction,
              });
            }
            return;
          }
          if (job.status === "failed") return;

          pollTimeoutRef.current = setTimeout(() => void tick(), POLL_INTERVAL_MS);
        } catch (err) {
          if (pollGenerationRef.current !== generation) return;
          setErrorMessage(extractErrorMessage(err, "Lost track of the compression's progress."));
        }
      };

      void tick();
    },
    [stopPolling],
  );

  const start = useCallback(async () => {
    if (!doc || starting) return;

    setStarting(true);
    setErrorMessage(null);
    setDownloadUrl(null);
    setResult(null);
    setProgressPercent(0);
    setStatus("queued");

    try {
      const { jobId } = await startCompression(
        doc.id,
        format,
        format === "pdf" ? preset : undefined,
        format === "pdf" && preset === "custom" ? custom : undefined,
        removeMetadata,
        cleanupUnusedObjects,
      );
      jobIdRef.current = jobId;
      poll(doc.id, jobId);
    } catch (err) {
      setErrorMessage(extractErrorMessage(err, "Couldn't start the compression."));
      setStatus(null);
    } finally {
      setStarting(false);
    }
  }, [doc, starting, format, preset, custom, removeMetadata, cleanupUnusedObjects, poll]);

  const replace = useCallback(async () => {
    if (!doc || jobIdRef.current === null || replacing) return;
    setReplacing(true);
    setErrorMessage(null);
    try {
      const opResult = await replaceWithCompression(doc.id, jobIdRef.current);
      applyOperationResult(opResult);
      setDialogOpen(false);
    } catch (err) {
      setErrorMessage(extractErrorMessage(err, "Couldn't replace the original with the compressed version."));
    } finally {
      setReplacing(false);
    }
  }, [doc, replacing, applyOperationResult]);

  const value: CompressionWorkflowContextValue = {
    dialogOpen,
    openDialog,
    closeDialog,
    format,
    setFormat,
    preset,
    setPreset,
    custom,
    setCustom,
    removeMetadata,
    setRemoveMetadata,
    cleanupUnusedObjects,
    setCleanupUnusedObjects,
    filename: doc?.filename ?? null,
    originalSizeBytes: doc?.sizeBytes ?? null,
    pageCount,
    starting,
    status,
    progressPercent,
    errorMessage,
    downloadUrl,
    result,
    start,
    replacing,
    replace,
  };

  return <CompressionWorkflowContext.Provider value={value}>{children}</CompressionWorkflowContext.Provider>;
}

export function useCompressionWorkflow(): CompressionWorkflowContextValue {
  const ctx = useContext(CompressionWorkflowContext);
  if (!ctx) {
    throw new Error("useCompressionWorkflow must be used within a CompressionWorkflowProvider");
  }
  return ctx;
}
