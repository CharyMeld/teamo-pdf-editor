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
import { useDocumentViewState } from "../hooks/useDocumentViewState";
import { useOpenDocument } from "../hooks/useOpenDocument";
import { useWorkingDocument } from "../hooks/useWorkingDocument";
import {
  createImageObject,
  createOverlayTextEdit,
  createTextObject,
  deleteContentObject,
  duplicateContentObject,
  getContentObjects,
  patchContentObject,
  type ContentBox,
  type ContentObject,
  type ContentObjectType,
  type PatchContentObjectInput,
  type TextObjectParams,
} from "../lib/api";
import { extractErrorMessage } from "../lib/errors";

export const DEFAULT_TEXT_PARAMS: TextObjectParams = {
  text: "",
  font: "Helvetica",
  fontSize: 14,
  bold: false,
  italic: false,
  color: "#111111",
  align: "left",
  lineSpacing: 1.2,
};

/** What the user is currently trying to place on the canvas via a
 * click-and-drag box (see ContentObjectLayer) — mirrors CropDialog's single-
 * purpose drag interaction, generalized to two placement kinds. Cleared as
 * soon as the resulting object is created (or the user cancels). */
export type PlacementMode = "text" | "editText" | "image" | null;

interface ContentObjectsContextValue {
  objects: ContentObject[];
  availableFonts: string[];
  selectedId: string | null;
  selectedObject: ContentObject | null;
  selectObject: (id: string | null, knownType?: ContentObjectType) => void;
  loading: boolean;
  busy: boolean;
  error: string | null;

  /** Local `URL.createObjectURL` previews for images inserted THIS session
   * (keyed by objectId) — the backend never exposes a raw image file path
   * to the client (see ARCHITECTURE.md), so this is the only way to show a
   * real preview of an image object's actual pixels without a dedicated
   * per-object image-fetch endpoint. An id with no entry here (e.g. after a
   * reload, or an image from a prior session) falls back to a neutral
   * placeholder in ContentObjectLayer — the real image is still correctly
   * in the generated PDF regardless; this only affects the live-edit
   * preview. */
  imagePreviewUrls: Record<string, string>;

  placementMode: PlacementMode;
  startPlacing: (mode: Exclude<PlacementMode, null>) => void;
  cancelPlacing: () => void;
  /** A box the user just drew (PDF points, bottom-left origin) while in
   * placementMode "text" or "editText" — commits via commitTextPlacement. */
  commitTextPlacement: (box: ContentBox, params: TextObjectParams) => Promise<void>;
  /** Places a new image object — called after the user picks a file (no
   * drag-to-place needed, a sensible default box is computed by the
   * caller). */
  createImage: (page: number, box: ContentBox, file: File) => Promise<void>;

  patchSelected: (patch: PatchContentObjectInput) => Promise<void>;
  deleteSelected: () => Promise<void>;
  duplicateSelected: () => Promise<void>;
}

const ContentObjectsContext = createContext<ContentObjectsContextValue | null>(null);

/**
 * Real Phase 4 content-object state for the currently-open document's
 * currently-viewed page: fetched from GET .../content/objects (never
 * fabricated), with every mutation going through the real backend endpoints
 * in lib/api.ts and the same undo/redo/thumbnail machinery Phase 3 built
 * (via useWorkingDocument.applyOperationResult) — see ARCHITECTURE.md's
 * Phase 4 (frontend) section for the full design.
 */
export function ContentObjectsProvider({ children }: { children: ReactNode }) {
  const { document: doc } = useOpenDocument();
  const view = useDocumentViewState();
  const working = useWorkingDocument();
  const { selection, setSelection } = useSelectionContext();

  const [objects, setObjects] = useState<ContentObject[]>([]);
  const [availableFonts, setAvailableFonts] = useState<string[]>(["Helvetica", "Times", "Courier"]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placementMode, setPlacementMode] = useState<PlacementMode>(null);
  const [imagePreviewUrls, setImagePreviewUrls] = useState<Record<string, string>>({});

  const fetchGenerationRef = useRef(0);
  // Set right before a mutation THIS hook performed bumps
  // useWorkingDocument's `revision` (see runMutating) — that bump doesn't
  // mean the object list needs a reset-and-refetch-from-scratch (runMutating
  // already refetches, and the caller manages selecting the newly
  // created/updated object), unlike a revision bump from an ORGANIZE page
  // operation, which legitimately can invalidate the whole content chain
  // (see the effect below). Without this, the reset effect's unconditional
  // `setSelectedId(null)` fired on every single content mutation's own
  // revision bump and immediately undid the very selection the mutation's
  // caller had just set (e.g. commitTextPlacement's `selectObject(id)` right
  // after creating a text object).
  const selfCausedRevisionRef = useRef(false);

  const selectedObject = objects.find((o) => o.objectId === selectedId) ?? null;

  const selectObject = useCallback(
    (id: string | null, knownType?: ContentObjectType) => {
      setSelectedId(id);
      if (!id) {
        setSelection("none");
        return;
      }
      // `knownType` lets a caller that just created/duplicated an object
      // (createTextObject/createOverlayTextEdit/createImageObject/
      // duplicateContentObject) select it immediately without waiting on
      // the follow-up refetch() — that request is still in flight at this
      // point, so looking the id up in the current (stale) `objects` array
      // would silently fail and fall through to "none", undoing the
      // selection the caller just asked for. A plain canvas click (no
      // second argument) still resolves the type from the real object list.
      const type = knownType ?? objects.find((o) => o.objectId === id)?.type;
      setSelection(type === "image" ? "image" : type ? "text" : "none");
    },
    [objects, setSelection],
  );

  // Re-fetch whenever the open document, the current page, or the working
  // copy's structure (Phase 3 page ops, undo/redo, saves — `revision`)
  // changes: a page/content operation can change which objects exist or
  // invalidate object ids entirely (e.g. a page op bakes the prior chain in
  // and starts a fresh, empty one — see ARCHITECTURE.md's Phase 4 backend
  // scope boundary), so a stale object list would be actively wrong here,
  // the same reasoning usePageSelection already applies to page selection.
  useEffect(() => {
    if (selfCausedRevisionRef.current) {
      selfCausedRevisionRef.current = false;
      return;
    }
    setSelectedId(null);
    if (selection === "text" || selection === "image") setSelection("none");

    if (!doc || doc.status !== "ready" || view.currentPage <= 0) {
      setObjects([]);
      return;
    }

    const generation = ++fetchGenerationRef.current;
    setLoading(true);
    setError(null);
    getContentObjects(doc.id, view.currentPage)
      .then((res) => {
        if (fetchGenerationRef.current !== generation) return;
        setObjects(res.objects);
        setAvailableFonts(res.availableFonts);
      })
      .catch((err: unknown) => {
        if (fetchGenerationRef.current !== generation) return;
        setError(extractErrorMessage(err, "Couldn't load page content."));
      })
      .finally(() => {
        if (fetchGenerationRef.current === generation) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id, doc?.status, view.currentPage, working.revision]);

  const refetch = useCallback(() => {
    if (!doc) return;
    const generation = ++fetchGenerationRef.current;
    getContentObjects(doc.id, view.currentPage)
      .then((res) => {
        if (fetchGenerationRef.current !== generation) return;
        setObjects(res.objects);
      })
      .catch(() => {
        // Non-fatal — the next revision-triggered refetch will recover.
      });
  }, [doc, view.currentPage]);

  const startPlacing = useCallback((mode: Exclude<PlacementMode, null>) => {
    setSelectedId(null);
    setPlacementMode(mode);
  }, []);

  const cancelPlacing = useCallback(() => setPlacementMode(null), []);

  /** Every mutation follows the same shape: set busy, call the real
   * endpoint, apply its OperationResult to useWorkingDocument (so Undo/Redo
   * and the thumbnail panel stay correct), refetch this page's object list
   * (the response only carries pageCount/objectId, not the full object —
   * simplest correct approach is one more real GET), and surface any
   * rejection as a real, specific error rather than a silent no-op. Generic
   * over the result type so callers that need the fresh `objectId` (create/
   * duplicate) can use it too, not just the void-returning ones. */
  const runMutating = useCallback(
    async <T extends { pageCount: number; canUndo: boolean; canRedo: boolean }>(
      action: () => Promise<T>,
    ): Promise<T> => {
      setBusy(true);
      setError(null);
      try {
        const result = await action();
        selfCausedRevisionRef.current = true;
        working.applyOperationResult(result);
        refetch();
        return result;
      } catch (err) {
        setError(extractErrorMessage(err, "That change couldn't be applied."));
        throw err;
      } finally {
        setBusy(false);
      }
    },
    [working, refetch],
  );

  const commitTextPlacement = useCallback(
    async (box: ContentBox, params: TextObjectParams) => {
      if (!doc || placementMode === null) return;
      const page = view.currentPage;
      try {
        const result =
          placementMode === "editText"
            ? await runMutating(() =>
                createOverlayTextEdit(doc.id, { page, ...box, params, coverOriginal: box }),
              )
            : await runMutating(() => createTextObject(doc.id, { page, ...box, params }));
        setPlacementMode(null);
        selectObject(result.objectId, placementMode === "editText" ? "text_overlay_edit" : "text");
      } catch {
        // runMutating already recorded the error; placement stays open so
        // the user can retry rather than losing their typed text.
      }
    },
    [doc, placementMode, view.currentPage, runMutating, selectObject],
  );

  const createImage = useCallback(
    async (page: number, box: ContentBox, file: File) => {
      if (!doc) return;
      try {
        const result = await runMutating(() => createImageObject(doc.id, { page, ...box, file }));
        setImagePreviewUrls((prev) => ({ ...prev, [result.objectId]: URL.createObjectURL(file) }));
        setPlacementMode(null);
        selectObject(result.objectId, "image");
      } catch {
        // runMutating already recorded the error.
      }
    },
    [doc, runMutating, selectObject],
  );

  const patchSelected = useCallback(
    async (patch: PatchContentObjectInput) => {
      if (!doc || !selectedId) return;
      await runMutating(() => patchContentObject(doc.id, selectedId, patch));
    },
    [doc, selectedId, runMutating],
  );

  const deleteSelected = useCallback(async () => {
    if (!doc || !selectedId) return;
    const id = selectedId;
    await runMutating(() => deleteContentObject(doc.id, id));
    selectObject(null);
  }, [doc, selectedId, runMutating, selectObject]);

  const duplicateSelected = useCallback(async () => {
    if (!doc || !selectedId) return;
    const sourcePreview = imagePreviewUrls[selectedId];
    const sourceType = selectedObject?.type;
    try {
      const result = await runMutating(() => duplicateContentObject(doc.id, selectedId));
      if (sourcePreview) {
        setImagePreviewUrls((prev) => ({ ...prev, [result.objectId]: sourcePreview }));
      }
      selectObject(result.objectId, sourceType);
    } catch {
      // runMutating already recorded the error.
    }
  }, [doc, selectedId, selectedObject, imagePreviewUrls, runMutating, selectObject]);

  const value: ContentObjectsContextValue = {
    objects,
    availableFonts,
    selectedId,
    selectedObject,
    selectObject,
    loading,
    busy,
    error,
    imagePreviewUrls,
    placementMode,
    startPlacing,
    cancelPlacing,
    commitTextPlacement,
    createImage,
    patchSelected,
    deleteSelected,
    duplicateSelected,
  };

  return <ContentObjectsContext.Provider value={value}>{children}</ContentObjectsContext.Provider>;
}

export function useContentObjects(): ContentObjectsContextValue {
  const ctx = useContext(ContentObjectsContext);
  if (!ctx) {
    throw new Error("useContentObjects must be used within a ContentObjectsProvider");
  }
  return ctx;
}
