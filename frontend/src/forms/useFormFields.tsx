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
  clearFormValues,
  createFormField,
  deleteFormField,
  duplicateFormField,
  fillFormValues,
  getFormFields,
  patchFormField,
  type FormField,
  type FormFieldType,
  type PatchFormFieldInput,
} from "../lib/api";
import { extractErrorMessage } from "../lib/errors";

/** What the user is currently trying to place on the canvas via a
 * click-and-drag box — mirrors ContentObjectLayer's `PlacementMode`,
 * generalized to the six field types. */
export type FieldPlacementMode = FormFieldType | null;

let radioGroupCounter = 0;

/** Sensible, immediately-valid default params per type — a field is
 * created and selected right away on drag-release (unlike Phase 4's text
 * object, no field type here is meaningfully "empty" the way blank text
 * would be, so there's no composer popover to fill in first; refine via
 * the Smart Inspector afterward). */
function defaultParams(type: FormFieldType): Record<string, unknown> {
  switch (type) {
    case "text":
      return { required: false, defaultValue: "", maxLength: null, multiline: false };
    case "date":
      return { required: false, defaultValue: "", dateFormat: "YYYY-MM-DD" };
    case "checkbox":
      return { required: false, label: "Checkbox", defaultChecked: false };
    case "radio": {
      radioGroupCounter += 1;

      return { required: false, groupName: `group_${radioGroupCounter}`, optionValue: "Option 1", defaultSelected: false };
    }
    case "dropdown":
      return { required: false, options: ["Option 1", "Option 2"], defaultValue: "" };
    case "signature":
      return { label: "Sign here" };
  }
}

interface FormFieldsContextValue {
  fields: FormField[];
  selectedId: string | null;
  selectedField: FormField | null;
  selectField: (id: string | null) => void;
  loading: boolean;
  busy: boolean;
  error: string | null;

  placementMode: FieldPlacementMode;
  startPlacing: (type: FormFieldType) => void;
  cancelPlacing: () => void;
  /** A box the user just drew (PDF points, bottom-left origin) while a placement mode is armed. */
  commitPlacement: (page: number, box: { x: number; y: number; width: number; height: number }) => Promise<void>;

  patchSelected: (patch: PatchFormFieldInput) => Promise<void>;
  deleteSelected: () => Promise<void>;
  duplicateSelected: () => Promise<void>;

  fillValues: (values: Record<string, unknown>) => Promise<void>;
  clearValues: (fieldKeys?: string[]) => Promise<void>;
}

const FormFieldsContext = createContext<FormFieldsContextValue | null>(null);

/**
 * Phase 10 (PDF forms) frontend state — mirrors `useContentObjects.tsx`'s
 * shape closely: fetched from GET .../form/fields (never fabricated),
 * every mutation going through the real backend endpoints and the same
 * undo/redo/thumbnail machinery Phase 3 built (via
 * `working.applyOperationResult`). See `FormFieldService`'s docblock
 * server-side for why `fillValues`/`clearValues` live in the same
 * mutation shape as create/move/resize/delete — filling is just another
 * mutation of the same `form_field_*` chain, not a separate mechanism.
 */
export function FormFieldsProvider({ children }: { children: ReactNode }) {
  const { document: doc } = useOpenDocument();
  const view = useDocumentViewState();
  const working = useWorkingDocument();
  const { selection, setSelection } = useSelectionContext();

  const [fields, setFields] = useState<FormField[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placementMode, setPlacementMode] = useState<FieldPlacementMode>(null);

  const fetchGenerationRef = useRef(0);
  const selfCausedRevisionRef = useRef(false);

  const selectedField = fields.find((f) => f.fieldId === selectedId) ?? null;

  const selectField = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      setSelection(id ? "form" : "none");
    },
    [setSelection],
  );

  // Re-fetch whenever the open document, the current page, or the working
  // copy's structure changes — same reasoning useContentObjects already
  // established: a page/design operation can change which fields exist or
  // invalidate field ids entirely.
  useEffect(() => {
    if (selfCausedRevisionRef.current) {
      selfCausedRevisionRef.current = false;
      return;
    }
    setSelectedId(null);
    if (selection === "form") setSelection("none");

    if (!doc || doc.status !== "ready" || view.currentPage <= 0) {
      setFields([]);
      return;
    }

    const generation = ++fetchGenerationRef.current;
    setLoading(true);
    setError(null);
    getFormFields(doc.id, view.currentPage)
      .then((data) => {
        if (fetchGenerationRef.current !== generation) return;
        setFields(data);
      })
      .catch((err: unknown) => {
        if (fetchGenerationRef.current !== generation) return;
        setError(extractErrorMessage(err, "Couldn't load this page's form fields."));
      })
      .finally(() => {
        if (fetchGenerationRef.current === generation) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id, doc?.status, view.currentPage, working.revision]);

  const refetch = useCallback(() => {
    if (!doc) return;
    const generation = ++fetchGenerationRef.current;
    getFormFields(doc.id, view.currentPage)
      .then((data) => {
        if (fetchGenerationRef.current !== generation) return;
        setFields(data);
      })
      .catch(() => {
        // Non-fatal — the next revision-triggered refetch will recover.
      });
  }, [doc, view.currentPage]);

  const startPlacing = useCallback((type: FormFieldType) => {
    setSelectedId(null);
    setPlacementMode(type);
  }, []);

  const cancelPlacing = useCallback(() => setPlacementMode(null), []);

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

  const commitPlacement = useCallback(
    async (page: number, box: { x: number; y: number; width: number; height: number }) => {
      if (!doc || placementMode === null) return;
      const type = placementMode;
      try {
        const result = await runMutating(() =>
          createFormField(doc.id, { type, page, ...box, params: defaultParams(type) }),
        );
        setPlacementMode(null);
        selectField(result.fieldId);
      } catch {
        // runMutating already recorded the error; placement stays open so the user can retry.
      }
    },
    [doc, placementMode, runMutating, selectField],
  );

  const patchSelected = useCallback(
    async (patch: PatchFormFieldInput) => {
      if (!doc || !selectedId) return;
      await runMutating(() => patchFormField(doc.id, selectedId, patch));
    },
    [doc, selectedId, runMutating],
  );

  const deleteSelected = useCallback(async () => {
    if (!doc || !selectedId) return;
    const id = selectedId;
    await runMutating(() => deleteFormField(doc.id, id));
    selectField(null);
  }, [doc, selectedId, runMutating, selectField]);

  const duplicateSelected = useCallback(async () => {
    if (!doc || !selectedId) return;
    try {
      const result = await runMutating(() => duplicateFormField(doc.id, selectedId));
      selectField(result.fieldId);
    } catch {
      // runMutating already recorded the error.
    }
  }, [doc, selectedId, runMutating, selectField]);

  const fillValues = useCallback(
    async (values: Record<string, unknown>) => {
      if (!doc) return;
      await runMutating(() => fillFormValues(doc.id, values));
    },
    [doc, runMutating],
  );

  const clearValues = useCallback(
    async (fieldKeys?: string[]) => {
      if (!doc) return;
      await runMutating(() => clearFormValues(doc.id, fieldKeys));
    },
    [doc, runMutating],
  );

  const value: FormFieldsContextValue = {
    fields,
    selectedId,
    selectedField,
    selectField,
    loading,
    busy,
    error,
    placementMode,
    startPlacing,
    cancelPlacing,
    commitPlacement,
    patchSelected,
    deleteSelected,
    duplicateSelected,
    fillValues,
    clearValues,
  };

  return <FormFieldsContext.Provider value={value}>{children}</FormFieldsContext.Provider>;
}

export function useFormFields(): FormFieldsContextValue {
  const ctx = useContext(FormFieldsContext);
  if (!ctx) {
    throw new Error("useFormFields must be used within a FormFieldsProvider");
  }
  return ctx;
}
