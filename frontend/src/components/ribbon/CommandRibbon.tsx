import { useEffect, useState } from "react";
import { useSelectionContext } from "../../commands/useSelectionContext";
import { useActiveTab } from "../../hooks/useActiveTab";
import { useAnnotationRunHandlers } from "../../hooks/useAnnotationRunHandlers";
import { useContentEditorRunHandlers } from "../../hooks/useContentEditorRunHandlers";
import { useDocumentViewState } from "../../hooks/useDocumentViewState";
import { useOpenDocument } from "../../hooks/useOpenDocument";
import { useOrganizeRunHandlers } from "../../hooks/useOrganizeRunHandlers";
import { BREAKPOINTS, useMediaQuery } from "../../hooks/useMediaQuery";
import { useWorkingDocument } from "../../hooks/useWorkingDocument";
import { useScanWorkflow } from "../../scanning/useScanWorkflow";
import IconButton from "../ui/IconButton";
import CommandGroup from "./CommandGroup";
import CommandTabs from "./CommandTabs";
import ContextualCommandGroup from "./ContextualCommandGroup";
import MobileCommandSheet from "./MobileCommandSheet";

/** Real Ctrl/Cmd+Z (undo) and Ctrl/Cmd+Shift+Z or Ctrl+Y (redo) keyboard
 * shortcuts for Phase 3's page-operation history — skipped while focus is
 * in a text input/textarea so it never fights native text-editing undo. */
function useUndoRedoShortcuts() {
  const { undo, redo, canUndo, canRedo, busy } = useWorkingDocument();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      const meta = event.ctrlKey || event.metaKey;
      if (!meta) return;

      if (event.key.toLowerCase() === "z" && event.shiftKey) {
        event.preventDefault();
        if (canRedo && !busy) void redo();
      } else if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (canUndo && !busy) void undo();
      } else if (event.key.toLowerCase() === "y") {
        event.preventDefault();
        if (canRedo && !busy) void redo();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo, canUndo, canRedo, busy]);
}

/** The TeamO Command Ribbon: tabs, the active tab's command groups, and an
 * extra contextual group whenever a selection exists. Below 768px it
 * replaces the wide command-group strip with a compact action sheet
 * instead of shrinking the same layout. */
export default function CommandRibbon() {
  const { activeTab, setActiveTab } = useActiveTab();
  const { selection } = useSelectionContext();
  const view = useDocumentViewState();
  const { showOpenDialog } = useOpenDocument();
  const organize = useOrganizeRunHandlers();
  const contentEditor = useContentEditorRunHandlers();
  const annotations = useAnnotationRunHandlers();
  const scanWorkflow = useScanWorkflow();
  const isMobile = useMediaQuery(BREAKPOINTS.mobile);
  const [sheetOpen, setSheetOpen] = useState(false);
  useUndoRedoShortcuts();

  // Every command whose `status` is "available" gets its real handler
  // wired here, at the level that owns the relevant state — VIEW's
  // zoom/fit/navigation come from useDocumentViewState, HOME's Open comes
  // from useOpenDocument, ORGANIZE/Save/Undo/Redo come from
  // useOrganizeRunHandlers (Phase 3). CommandGroup/CommandButton just look
  // these up by id, so this map applies regardless of which tab is active.
  const runHandlers = {
    "view.zoomIn": view.zoomIn,
    "view.zoomOut": view.zoomOut,
    "view.fitPage": () => view.setFitMode("page"),
    "view.fitWidth": () => view.setFitMode("width"),
    "view.nextPage": view.goToNextPage,
    "view.prevPage": view.goToPrevPage,
    "home.open": showOpenDialog,
    "convert.fromImage": scanWorkflow.openDialog,
    ...organize.runHandlers,
    ...contentEditor.runHandlers,
    ...annotations.runHandlers,
  };
  const disabledReasons: Record<string, string> = {
    ...(view.canGoNext ? {} : { "view.nextPage": "No document open" }),
    ...(view.canGoPrev ? {} : { "view.prevPage": "No document open" }),
    ...organize.disabledReasons,
    ...contentEditor.disabledReasons,
    ...annotations.disabledReasons,
  };

  return (
    <div className="shrink-0 border-b border-border bg-surface">
      <div className="flex items-stretch justify-between">
        <CommandTabs activeTab={activeTab} onSelect={setActiveTab} />
        {isMobile && (
          <div className="flex shrink-0 items-center pr-2">
            <IconButton icon="menu" label="Commands" onClick={() => setSheetOpen(true)} />
          </div>
        )}
      </div>

      {!isMobile && (
        <div className="flex items-stretch">
          <CommandGroup activeTab={activeTab} runHandlers={runHandlers} disabledReasons={disabledReasons} />
          {selection !== "none" && (
            <ContextualCommandGroup
              selection={selection}
              runHandlers={runHandlers}
              disabledReasons={disabledReasons}
            />
          )}
        </div>
      )}

      {isMobile && (
        <MobileCommandSheet
          activeTab={activeTab}
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          runHandlers={runHandlers}
        />
      )}
    </div>
  );
}
