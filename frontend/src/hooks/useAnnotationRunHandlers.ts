import { useAnnotations } from "../annotations/useAnnotations";
import { useOpenDocument } from "./useOpenDocument";
import { useWorkingDocument } from "./useWorkingDocument";

interface AnnotationRunHandlers {
  runHandlers: Record<string, () => void>;
  disabledReasons: Record<string, string>;
}

/**
 * Real `run`/`disabledReason` maps for ANNOTATE's 10 placement commands and
 * the "Delete Annotation" contextual command — the same shape
 * `useContentEditorRunHandlers` (Phase 4) and `useOrganizeRunHandlers`
 * (Phase 3) established. Every placement command just arms `placementMode`;
 * AnnotationLayer turns the resulting canvas gesture (box drag, two-point
 * drag for arrow, path sampling for freehand, or a single click for sticky
 * note) into the real backend call.
 */
export function useAnnotationRunHandlers(): AnnotationRunHandlers {
  const { document: doc } = useOpenDocument();
  const working = useWorkingDocument();
  const { startPlacing, selectedId, deleteSelected } = useAnnotations();

  const documentReady = !!doc && doc.status === "ready";

  const placementIds = [
    "annotate.highlight",
    "annotate.underline",
    "annotate.strikethrough",
    "annotate.freehand",
    "annotate.rectangle",
    "annotate.circle",
    "annotate.arrow",
    "annotate.textBox",
    "annotate.note",
    "annotate.stamp",
  ] as const;

  const placementTypeById: Record<(typeof placementIds)[number], Parameters<typeof startPlacing>[0]> = {
    "annotate.highlight": "highlight",
    "annotate.underline": "underline",
    "annotate.strikethrough": "strikethrough",
    "annotate.freehand": "freehand",
    "annotate.rectangle": "rectangle",
    "annotate.circle": "circle",
    "annotate.arrow": "arrow",
    "annotate.textBox": "text_box",
    "annotate.note": "sticky_note",
    "annotate.stamp": "stamp",
  };

  const runHandlers: Record<string, () => void> = {
    "context.annotation.delete": () => void deleteSelected(),
  };
  for (const id of placementIds) {
    runHandlers[id] = () => startPlacing(placementTypeById[id]);
  }

  const disabledReasons: Record<string, string> = {};
  for (const id of placementIds) {
    if (!documentReady) disabledReasons[id] = "No document open";
    else if (working.busy) disabledReasons[id] = working.busyLabel ?? "An operation is in progress…";
  }
  if (!documentReady) disabledReasons["context.annotation.delete"] = "No document open";
  else if (working.busy) disabledReasons["context.annotation.delete"] = working.busyLabel ?? "An operation is in progress…";
  else if (!selectedId) disabledReasons["context.annotation.delete"] = "Nothing selected";

  return { runHandlers, disabledReasons };
}
