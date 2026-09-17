import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import {
  addScanImages,
  createScanPdf,
  createScanSession,
  getScanImagePreviewUrl,
  patchScanImage,
  removeScanImage,
  reorderScanImages,
  type DocumentSummary,
  type PatchScanImageInput,
  type ScanSessionImage,
} from "../lib/api";
import { extractErrorMessage } from "../lib/errors";

interface ScanWorkflowContextValue {
  dialogOpen: boolean;
  openDialog: () => void;
  closeDialog: () => void;

  sessionId: string | null;
  images: ScanSessionImage[];
  selectedImageId: number | null;
  selectImage: (id: number | null) => void;

  loading: boolean;
  busy: boolean;
  error: string | null;

  addFiles: (files: File[]) => Promise<void>;
  updateSelected: (patch: PatchScanImageInput) => Promise<void>;
  removeImage: (id: number) => Promise<void>;
  reorder: (imageIds: number[]) => Promise<void>;

  /** Object URL for the given image's current processed preview — caller does NOT need to revoke it; the hook manages its own cache and revokes stale ones. */
  previewUrl: (imageId: number) => string | undefined;
  refreshPreview: (imageId: number) => Promise<void>;

  createPdf: (title: string) => Promise<DocumentSummary>;
}

const ScanWorkflowContext = createContext<ScanWorkflowContextValue | null>(null);

/**
 * Phase 6's own lightweight provider — deliberately independent of
 * `useWorkingDocument`/`useOpenDocument`: this workflow creates a brand
 * NEW document and has nothing to do with whatever is (or isn't)
 * currently open in the main editor, unlike every other dialog in
 * `components/dialogs/` which all operate on the currently-open document.
 */
export function ScanWorkflowProvider({ children }: { children: ReactNode }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [images, setImages] = useState<ScanSessionImage[]>([]);
  const [selectedImageId, setSelectedImageId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewUrlsRef = useRef<Record<number, string>>({});

  const openDialog = useCallback(() => {
    setDialogOpen(true);
    setError(null);
    setLoading(true);
    createScanSession()
      .then((id) => {
        setSessionId(id);
        setImages([]);
      })
      .catch((err: unknown) => setError(extractErrorMessage(err, "Couldn't start a new scan session.")))
      .finally(() => setLoading(false));
  }, []);

  const closeDialog = useCallback(() => {
    setDialogOpen(false);
    setSessionId(null);
    setImages([]);
    setSelectedImageId(null);
    setError(null);
    Object.values(previewUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
    previewUrlsRef.current = {};
  }, []);

  const selectImage = useCallback((id: number | null) => setSelectedImageId(id), []);

  const refreshPreview = useCallback(
    async (imageId: number) => {
      if (!sessionId) return;
      const stale = previewUrlsRef.current[imageId];
      try {
        const url = await getScanImagePreviewUrl(sessionId, imageId);
        previewUrlsRef.current = { ...previewUrlsRef.current, [imageId]: url };
        // Force a re-render so components reading `previewUrl(id)` pick up the new URL.
        setImages((prev) => [...prev]);
      } finally {
        if (stale) URL.revokeObjectURL(stale);
      }
    },
    [sessionId],
  );

  const previewUrl = useCallback((imageId: number) => previewUrlsRef.current[imageId], []);

  const addFiles = useCallback(
    async (files: File[]) => {
      if (!sessionId) return;
      setBusy(true);
      setError(null);
      try {
        const created = await addScanImages(sessionId, files);
        setImages((prev) => [...prev, ...created]);
        await Promise.all(created.map((image) => refreshPreview(image.id)));
      } catch (err) {
        setError(extractErrorMessage(err, "Couldn't add those images."));
      } finally {
        setBusy(false);
      }
    },
    [sessionId, refreshPreview],
  );

  const updateSelected = useCallback(
    async (patch: PatchScanImageInput) => {
      if (!sessionId || selectedImageId === null) return;
      setBusy(true);
      setError(null);
      try {
        const updated = await patchScanImage(sessionId, selectedImageId, patch);
        setImages((prev) => prev.map((img) => (img.id === updated.id ? updated : img)));
        await refreshPreview(updated.id);
      } catch (err) {
        setError(extractErrorMessage(err, "That adjustment couldn't be applied."));
      } finally {
        setBusy(false);
      }
    },
    [sessionId, selectedImageId, refreshPreview],
  );

  const removeImage = useCallback(
    async (id: number) => {
      if (!sessionId) return;
      setBusy(true);
      setError(null);
      try {
        await removeScanImage(sessionId, id);
        setImages((prev) => prev.filter((img) => img.id !== id));
        if (selectedImageId === id) setSelectedImageId(null);
        const stale = previewUrlsRef.current[id];
        if (stale) {
          URL.revokeObjectURL(stale);
          const next = { ...previewUrlsRef.current };
          delete next[id];
          previewUrlsRef.current = next;
        }
      } catch (err) {
        setError(extractErrorMessage(err, "Couldn't remove that image."));
      } finally {
        setBusy(false);
      }
    },
    [sessionId, selectedImageId],
  );

  const reorder = useCallback(
    async (imageIds: number[]) => {
      if (!sessionId) return;
      setBusy(true);
      setError(null);
      try {
        const reordered = await reorderScanImages(sessionId, imageIds);
        setImages(reordered);
      } catch (err) {
        setError(extractErrorMessage(err, "Couldn't reorder those images."));
      } finally {
        setBusy(false);
      }
    },
    [sessionId],
  );

  const createPdf = useCallback(
    async (title: string) => {
      if (!sessionId) throw new Error("No active scan session.");
      setBusy(true);
      setError(null);
      try {
        return await createScanPdf(sessionId, title);
      } catch (err) {
        setError(extractErrorMessage(err, "Couldn't create the PDF."));
        throw err;
      } finally {
        setBusy(false);
      }
    },
    [sessionId],
  );

  const value: ScanWorkflowContextValue = {
    dialogOpen,
    openDialog,
    closeDialog,
    sessionId,
    images,
    selectedImageId,
    selectImage,
    loading,
    busy,
    error,
    addFiles,
    updateSelected,
    removeImage,
    reorder,
    previewUrl,
    refreshPreview,
    createPdf,
  };

  return <ScanWorkflowContext.Provider value={value}>{children}</ScanWorkflowContext.Provider>;
}

export function useScanWorkflow(): ScanWorkflowContextValue {
  const ctx = useContext(ScanWorkflowContext);
  if (!ctx) {
    throw new Error("useScanWorkflow must be used within a ScanWorkflowProvider");
  }
  return ctx;
}
