import { useContentObjects } from "../content-editor/useContentObjects";
import { useOpenDocument } from "./useOpenDocument";
import { useWorkingDocument } from "./useWorkingDocument";

interface ContentEditorRunHandlers {
  runHandlers: Record<string, () => void>;
  disabledReasons: Record<string, string>;
}

/**
 * Real `run`/`disabledReason` maps for EDIT's Add Text / Add Image / Edit
 * Text ribbon commands and the text/image contextual Delete commands — the
 * same shape useOrganizeRunHandlers established for ORGANIZE, kept as its
 * own hook because it's backed by useContentObjects (Phase 4) rather than
 * useWorkingDocument's page operations directly. "Add Text"/"Edit Text"/
 * "Add Image" all just arm placement mode; the actual box the user draws on
 * the canvas is what ContentObjectLayer turns into a real create call (an
 * image insert additionally opens a file picker once that box is drawn —
 * see ContentObjectLayer).
 */
export function useContentEditorRunHandlers(): ContentEditorRunHandlers {
  const { document: doc } = useOpenDocument();
  const working = useWorkingDocument();
  const { startPlacing, selectedId, deleteSelected } = useContentObjects();

  const documentReady = !!doc && doc.status === "ready";

  const runHandlers: Record<string, () => void> = {
    "edit.addText": () => startPlacing("text"),
    "edit.editText": () => startPlacing("editText"),
    "edit.addImage": () => startPlacing("image"),
    "context.text.delete": () => void deleteSelected(),
    "context.image.delete": () => void deleteSelected(),
  };

  const disabledReasons: Record<string, string> = {};
  for (const id of ["edit.addText", "edit.editText", "edit.addImage"]) {
    if (!documentReady) disabledReasons[id] = "No document open";
    else if (working.busy) disabledReasons[id] = working.busyLabel ?? "An operation is in progress…";
  }
  for (const id of ["context.text.delete", "context.image.delete"]) {
    if (!documentReady) disabledReasons[id] = "No document open";
    else if (working.busy) disabledReasons[id] = working.busyLabel ?? "An operation is in progress…";
    else if (!selectedId) disabledReasons[id] = "Nothing selected";
  }

  return { runHandlers, disabledReasons };
}
