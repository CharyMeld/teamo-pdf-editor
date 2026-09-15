import { useDocumentViewState } from "./useDocumentViewState";
import { useOpenDocument } from "./useOpenDocument";
import { usePageSelection } from "./usePageSelection";
import { usePanelVisibility } from "./usePanelVisibility";
import { useWorkingDocument } from "./useWorkingDocument";

interface OrganizeRunHandlers {
  runHandlers: Record<string, () => void>;
  disabledReasons: Record<string, string>;
}

/**
 * Builds the real `run`/`disabledReason` maps for every ORGANIZE + HOME
 * Save/Save-As + EDIT Undo/Redo + contextual page command — the same
 * `runHandlers`/`disabledReasons` shape CommandRibbon already established
 * for VIEW's zoom/fit and HOME's Open (Phase 1-2). Reads the shared
 * usePageSelection/useWorkingDocument/useOpenDocument contexts (no state of
 * its own), so CommandRibbon, AppHeader's command search, and
 * MobileCommandSheet can all call this and stay in sync with one source of
 * truth. Where a command needs a single target page and nothing is
 * explicitly selected, it falls back to the currently-viewed page — the
 * conventional default in every PDF editor's page-operation toolbar.
 */
export function useOrganizeRunHandlers(): OrganizeRunHandlers {
  const { document: doc } = useOpenDocument();
  const view = useDocumentViewState();
  const { selectedPages, selectedCount } = usePageSelection();
  const working = useWorkingDocument();
  const { openThumbnail } = usePanelVisibility();

  const documentReady = !!doc && doc.status === "ready";
  const targetPages = selectedCount > 0 ? selectedPages : view.currentPage > 0 ? [view.currentPage] : [];
  const singleTarget = selectedCount === 1 ? selectedPages[0] : selectedCount === 0 ? view.currentPage : null;

  const runHandlers: Record<string, () => void> = {
    "home.save": () => void working.save(),
    "home.saveAs": working.openSaveAsDialog,
    "edit.undo": () => void working.undo(),
    "edit.redo": () => void working.redo(),

    "organize.rotate.left": () => void working.runRotate(targetPages, -90),
    "organize.rotate.right": () => void working.runRotate(targetPages, 90),
    "organize.deletePage": () => {
      if (targetPages.length > 1 && !window.confirm(`Delete ${targetPages.length} pages?`)) return;
      void working.runDelete(targetPages);
    },
    "organize.duplicatePage": () => void working.runDuplicate(targetPages),
    "organize.insertPage": working.openInsertDialog,
    "organize.replacePage": () => {
      if (singleTarget !== null) working.openReplaceDialog(singleTarget);
    },
    "organize.cropPage": () => {
      if (singleTarget !== null) working.openCropDialog([singleTarget]);
    },
    "organize.reorderPages": () => {
      openThumbnail();
      working.notify({ type: "success", message: "Drag a page thumbnail to a new position to reorder." });
    },
    "organize.extractPages": () => void working.runExtract(targetPages),
    "organize.splitDocument": working.openSplitDialog,
    "organize.merge": working.openMergeDialog,

    "context.page.rotate": () => void working.runRotate(selectedPages, 90),
    "context.page.duplicate": () => void working.runDuplicate(selectedPages),
    "context.page.crop": () => {
      if (selectedCount === 1) working.openCropDialog(selectedPages);
    },
    "context.page.replace": () => {
      if (selectedCount === 1) working.openReplaceDialog(selectedPages[0]);
    },
    "context.page.extract": () => void working.runExtract(selectedPages),
    "context.page.delete": () => {
      if (selectedPages.length > 1 && !window.confirm(`Delete ${selectedPages.length} pages?`)) return;
      void working.runDelete(selectedPages);
    },
  };

  const notReadyReason = "No document open";
  const busyReason = working.busyLabel ?? "An operation is in progress…";

  const baseDisabled: Record<string, string> = {};
  for (const id of [
    "home.save",
    "home.saveAs",
    "edit.undo",
    "edit.redo",
    "organize.rotate",
    "organize.rotate.left",
    "organize.rotate.right",
    "organize.deletePage",
    "organize.duplicatePage",
    "organize.insertPage",
    "organize.replacePage",
    "organize.cropPage",
    "organize.reorderPages",
    "organize.extractPages",
    "organize.splitDocument",
    "organize.merge",
    "context.page.rotate",
    "context.page.duplicate",
    "context.page.crop",
    "context.page.replace",
    "context.page.extract",
    "context.page.delete",
  ]) {
    if (!documentReady) baseDisabled[id] = notReadyReason;
    else if (working.busy) baseDisabled[id] = busyReason;
  }

  const disabledReasons: Record<string, string> = { ...baseDisabled };
  if (documentReady && !working.busy) {
    if (!working.canUndo) disabledReasons["edit.undo"] = "Nothing to undo";
    if (!working.canRedo) disabledReasons["edit.redo"] = "Nothing to redo";
    if (selectedCount > 1) {
      disabledReasons["organize.replacePage"] = "Select exactly one page";
      disabledReasons["organize.cropPage"] = "Select exactly one page";
    }
    if (selectedCount !== 1) {
      disabledReasons["context.page.replace"] = "Select exactly one page";
      disabledReasons["context.page.crop"] = "Select exactly one page";
    }
  }

  return { runHandlers, disabledReasons };
}
