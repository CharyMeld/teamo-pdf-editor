import { useFormFields } from "../forms/useFormFields";
import { useOpenDocument } from "./useOpenDocument";
import { useWorkingDocument } from "./useWorkingDocument";

interface FormRunHandlers {
  runHandlers: Record<string, () => void>;
  disabledReasons: Record<string, string>;
}

/**
 * Real `run`/`disabledReason` maps for FORMS' field-placement commands and
 * "Clear All Fields" — the same shape `useAnnotationRunHandlers` (Phase 5)
 * and `useContentEditorRunHandlers` (Phase 4) already established. Every
 * placement command just arms `placementMode`; `FormFieldLayer` turns the
 * resulting canvas drag into the real backend call.
 */
export function useFormRunHandlers(): FormRunHandlers {
  const { document: doc } = useOpenDocument();
  const working = useWorkingDocument();
  const { startPlacing, clearValues, deleteSelected, duplicateSelected, selectedId, busy } = useFormFields();

  const documentReady = !!doc && doc.status === "ready";

  const placementIds = [
    "forms.addTextField",
    "forms.addCheckbox",
    "forms.addRadioButton",
    "forms.addDropdown",
    "forms.addDateField",
    "forms.addSignatureField",
  ] as const;

  const placementTypeById: Record<(typeof placementIds)[number], Parameters<typeof startPlacing>[0]> = {
    "forms.addTextField": "text",
    "forms.addCheckbox": "checkbox",
    "forms.addRadioButton": "radio",
    "forms.addDropdown": "dropdown",
    "forms.addDateField": "date",
    "forms.addSignatureField": "signature",
  };

  const runHandlers: Record<string, () => void> = {
    "forms.clearAll": () => void clearValues(),
    "context.form.duplicate": () => void duplicateSelected(),
    "context.form.delete": () => void deleteSelected(),
  };
  for (const id of placementIds) {
    runHandlers[id] = () => startPlacing(placementTypeById[id]);
  }

  const disabledReasons: Record<string, string> = {};
  const busyReason = working.busy || busy ? working.busyLabel ?? "An operation is in progress…" : null;
  for (const id of placementIds) {
    if (!documentReady) disabledReasons[id] = "No document open";
    else if (busyReason) disabledReasons[id] = busyReason;
  }
  if (!documentReady) disabledReasons["forms.clearAll"] = "No document open";
  else if (busyReason) disabledReasons["forms.clearAll"] = busyReason;

  for (const id of ["context.form.duplicate", "context.form.delete"] as const) {
    if (!documentReady) disabledReasons[id] = "No document open";
    else if (busyReason) disabledReasons[id] = busyReason;
    else if (!selectedId) disabledReasons[id] = "Nothing selected";
  }

  return { runHandlers, disabledReasons };
}
