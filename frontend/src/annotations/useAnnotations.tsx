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
  createAnnotation,
  deleteAnnotation,
  duplicateAnnotation,
  getAnnotations,
  patchAnnotation,
  type Annotation,
  type AnnotationType,
  type PatchAnnotationInput,
  type StampPreset,
} from "../lib/api";
import { extractErrorMessage } from "../lib/errors";

/** What the user is currently trying to place via a click-and-drag box, a
 * click-and-drag path (freehand), or a single click (sticky note) — see
 * AnnotationLayer. Cleared as soon as the resulting annotation is created
 * (or the user cancels). Reuses AnnotationType directly since every type
 * is a placeable tool, just with different placement gestures. */
export type PlacementMode = AnnotationType | null;

interface AnnotationsContextValue {
  annotations: Annotation[];
  stampPresets: Record<string, StampPreset>;
  selectedId: string | null;
  selectedAnnotation: Annotation | null;
  selectAnnotation: (id: string | null, knownType?: AnnotationType) => void;
  loading: boolean;
  busy: boolean;
  error: string | null;

  /** Local `URL.createObjectURL` previews for a stamp image inserted THIS
   * session (keyed by annotationId) — same reasoning as Phase 4's
   * `imagePreviewUrls` (see content-editor/useContentObjects.tsx). */
  imagePreviewUrls: Record<string, string>;

  placementMode: PlacementMode;
  /** `signatureDefaults` flags the resulting annotation `isSignature` —
   * used by the SIGN tab's "Draw Signature" command, which reuses this
   * exact freehand placement mechanism unchanged (see ARCHITECTURE.md's
   * Phase 11 section). */
  startPlacing: (mode: Exclude<PlacementMode, null>, opts?: { signatureDefaults?: boolean }) => void;
  cancelPlacing: () => void;

  /** Commits any box-shaped or point-based annotation (everything except
   * a stamp image, which needs a File) — a single generic path since every
   * other type's backend request is just x/y/width/height(+x2/y2 for
   * arrow) + params, dispatched by `placementMode`. */
  commitAnnotation: (box: { x: number; y: number; width: number; height: number }, extra?: { x2?: number; y2?: number; params?: Record<string, unknown> }) => Promise<void>;
  createStampImage: (page: number, box: { x: number; y: number; width: number; height: number }, file: File) => Promise<void>;

  patchSelected: (patch: PatchAnnotationInput) => Promise<void>;
  deleteSelected: () => Promise<void>;
  duplicateSelected: () => Promise<void>;
}

const AnnotationsContext = createContext<AnnotationsContextValue | null>(null);

const DEFAULT_PARAMS_BY_TYPE: Record<AnnotationType, Record<string, unknown>> = {
  highlight: { color: "#FFFF00", opacity: 0.4 },
  underline: { color: "#2563EB", thickness: 2 },
  strikethrough: { color: "#DC2626", thickness: 2 },
  freehand: { color: "#EA580C", thickness: 3, points: [] },
  rectangle: { strokeColor: "#000000", strokeWidth: 1.5 },
  circle: { strokeColor: "#000000", strokeWidth: 1.5 },
  arrow: { color: "#000000", thickness: 2 },
  text_box: {
    text: "",
    font: "Helvetica",
    fontSize: 14,
    bold: false,
    italic: false,
    color: "#111111",
    align: "left",
    lineSpacing: 1.2,
  },
  sticky_note: { note: "", color: "#FBBF24" },
  stamp: { stampKind: "preset", presetKey: "approved" },
};

export function defaultAnnotationParams(type: AnnotationType): Record<string, unknown> {
  return { ...DEFAULT_PARAMS_BY_TYPE[type] };
}

/**
 * Real Phase 5 annotation state for the currently-open document's
 * currently-viewed page — the exact same shape `useContentObjects` (Phase
 * 4) established, as a parallel, independent sibling (its own chain, its
 * own endpoints — see ARCHITECTURE.md's Phase 5 section). Bakes in from
 * the start two real bugs Phase 4's own frontend session found the hard
 * way (see `[[content_editor_phase4_findings]]`):
 *  1. A `selfCausedRevisionRef` guard so a mutation's own `revision` bump
 *     (from `useWorkingDocument.applyOperationResult`) doesn't clear the
 *     selection that same mutation's caller just set.
 *  2. `selectAnnotation` takes an optional explicit `knownType` so
 *     selecting a just-created/duplicated annotation doesn't depend on a
 *     not-yet-refetched `annotations` array.
 */
export function AnnotationsProvider({ children }: { children: ReactNode }) {
  const { document: doc } = useOpenDocument();
  const view = useDocumentViewState();
  const working = useWorkingDocument();
  const { selection, setSelection } = useSelectionContext();

  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [stampPresets, setStampPresets] = useState<Record<string, StampPreset>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placementMode, setPlacementMode] = useState<PlacementMode>(null);
  const [pendingIsSignature, setPendingIsSignature] = useState(false);
  const [imagePreviewUrls, setImagePreviewUrls] = useState<Record<string, string>>({});
  // Phase 14 hardening — see useContentObjects.tsx's matching comment:
  // revoked only at the document boundary, not per-annotation-delete,
  // since duplicateSelected() below reuses the same blob URL string
  // for a duplicate's preview.
  const imagePreviewUrlsRef = useRef(imagePreviewUrls);
  useEffect(() => {
    imagePreviewUrlsRef.current = imagePreviewUrls;
  }, [imagePreviewUrls]);
  useEffect(() => {
    return () => {
      Object.values(imagePreviewUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
      setImagePreviewUrls({});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id]);

  const fetchGenerationRef = useRef(0);
  const selfCausedRevisionRef = useRef(false);

  const selectedAnnotation = annotations.find((a) => a.annotationId === selectedId) ?? null;

  const selectAnnotation = useCallback(
    (id: string | null, knownType?: AnnotationType) => {
      setSelectedId(id);
      if (!id) {
        setSelection("none");
        return;
      }
      const type = knownType ?? annotations.find((a) => a.annotationId === id)?.type;
      setSelection(type ? "annotation" : "none");
    },
    [annotations, setSelection],
  );

  useEffect(() => {
    if (selfCausedRevisionRef.current) {
      selfCausedRevisionRef.current = false;
      return;
    }
    setSelectedId(null);
    if (selection === "annotation") setSelection("none");

    if (!doc || doc.status !== "ready" || view.currentPage <= 0) {
      setAnnotations([]);
      return;
    }

    const generation = ++fetchGenerationRef.current;
    setLoading(true);
    setError(null);
    getAnnotations(doc.id, view.currentPage)
      .then((res) => {
        if (fetchGenerationRef.current !== generation) return;
        setAnnotations(res.annotations);
        setStampPresets(res.stampPresets);
      })
      .catch((err: unknown) => {
        if (fetchGenerationRef.current !== generation) return;
        setError(extractErrorMessage(err, "Couldn't load page annotations."));
      })
      .finally(() => {
        if (fetchGenerationRef.current === generation) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id, doc?.status, view.currentPage, working.revision]);

  const refetch = useCallback(() => {
    if (!doc) return;
    const generation = ++fetchGenerationRef.current;
    getAnnotations(doc.id, view.currentPage)
      .then((res) => {
        if (fetchGenerationRef.current !== generation) return;
        setAnnotations(res.annotations);
      })
      .catch(() => {
        // Non-fatal — the next revision-triggered refetch will recover.
      });
  }, [doc, view.currentPage]);

  const startPlacing = useCallback((mode: Exclude<PlacementMode, null>, opts?: { signatureDefaults?: boolean }) => {
    setSelectedId(null);
    setPlacementMode(mode);
    setPendingIsSignature(!!opts?.signatureDefaults);
  }, []);

  const cancelPlacing = useCallback(() => {
    setPlacementMode(null);
    setPendingIsSignature(false);
  }, []);

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

  const commitAnnotation = useCallback(
    async (
      box: { x: number; y: number; width: number; height: number },
      extra?: { x2?: number; y2?: number; params?: Record<string, unknown> },
    ) => {
      if (!doc || placementMode === null) return;
      const type = placementMode;
      const page = view.currentPage;
      const params = {
        ...defaultAnnotationParams(type),
        ...(extra?.params ?? {}),
        ...(pendingIsSignature ? { isSignature: true } : {}),
      };
      try {
        const result = await runMutating(() =>
          createAnnotation(doc.id, { type, page, ...box, x2: extra?.x2, y2: extra?.y2, params }),
        );
        setPlacementMode(null);
        setPendingIsSignature(false);
        selectAnnotation(result.annotationId, type);
      } catch {
        // runMutating already recorded the error; placement stays open so the user can retry.
      }
    },
    [doc, placementMode, pendingIsSignature, view.currentPage, runMutating, selectAnnotation],
  );

  const createStampImage = useCallback(
    async (page: number, box: { x: number; y: number; width: number; height: number }, file: File) => {
      if (!doc) return;
      try {
        const result = await runMutating(() =>
          createAnnotation(doc.id, { type: "stamp", page, ...box, params: { stampKind: "image" }, file }),
        );
        setImagePreviewUrls((prev) => ({ ...prev, [result.annotationId]: URL.createObjectURL(file) }));
        setPlacementMode(null);
        selectAnnotation(result.annotationId, "stamp");
      } catch {
        // runMutating already recorded the error.
      }
    },
    [doc, runMutating, selectAnnotation],
  );

  const patchSelected = useCallback(
    async (patch: PatchAnnotationInput) => {
      if (!doc || !selectedId) return;
      await runMutating(() => patchAnnotation(doc.id, selectedId, patch));
    },
    [doc, selectedId, runMutating],
  );

  const deleteSelected = useCallback(async () => {
    if (!doc || !selectedId) return;
    const id = selectedId;
    await runMutating(() => deleteAnnotation(doc.id, id));
    selectAnnotation(null);
  }, [doc, selectedId, runMutating, selectAnnotation]);

  const duplicateSelected = useCallback(async () => {
    if (!doc || !selectedId) return;
    const sourcePreview = imagePreviewUrls[selectedId];
    const sourceType = selectedAnnotation?.type;
    try {
      const result = await runMutating(() => duplicateAnnotation(doc.id, selectedId));
      if (sourcePreview) {
        setImagePreviewUrls((prev) => ({ ...prev, [result.annotationId]: sourcePreview }));
      }
      selectAnnotation(result.annotationId, sourceType);
    } catch {
      // runMutating already recorded the error.
    }
  }, [doc, selectedId, selectedAnnotation, imagePreviewUrls, runMutating, selectAnnotation]);

  const value: AnnotationsContextValue = {
    annotations,
    stampPresets,
    selectedId,
    selectedAnnotation,
    selectAnnotation,
    loading,
    busy,
    error,
    imagePreviewUrls,
    placementMode,
    startPlacing,
    cancelPlacing,
    commitAnnotation,
    createStampImage,
    patchSelected,
    deleteSelected,
    duplicateSelected,
  };

  return <AnnotationsContext.Provider value={value}>{children}</AnnotationsContext.Provider>;
}

export function useAnnotations(): AnnotationsContextValue {
  const ctx = useContext(AnnotationsContext);
  if (!ctx) {
    throw new Error("useAnnotations must be used within an AnnotationsProvider");
  }
  return ctx;
}
