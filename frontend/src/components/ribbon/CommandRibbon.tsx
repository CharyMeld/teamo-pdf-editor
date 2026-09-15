import { useState } from "react";
import { useSelectionContext } from "../../commands/useSelectionContext";
import { useActiveTab } from "../../hooks/useActiveTab";
import { useDocumentViewState } from "../../hooks/useDocumentViewState";
import { useOpenDocument } from "../../hooks/useOpenDocument";
import { BREAKPOINTS, useMediaQuery } from "../../hooks/useMediaQuery";
import IconButton from "../ui/IconButton";
import CommandGroup from "./CommandGroup";
import CommandTabs from "./CommandTabs";
import ContextualCommandGroup from "./ContextualCommandGroup";
import MobileCommandSheet from "./MobileCommandSheet";

/** The TeamO Command Ribbon: tabs, the active tab's command groups, and an
 * extra contextual group whenever a selection exists. Below 768px it
 * replaces the wide command-group strip with a compact action sheet
 * instead of shrinking the same layout. */
export default function CommandRibbon() {
  const { activeTab, setActiveTab } = useActiveTab();
  const { selection } = useSelectionContext();
  const view = useDocumentViewState();
  const { showOpenDialog } = useOpenDocument();
  const isMobile = useMediaQuery(BREAKPOINTS.mobile);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Every command whose `status` is "available" gets its real handler
  // wired here, at the level that owns the relevant state — VIEW's
  // zoom/fit/navigation come from useDocumentViewState, HOME's Open comes
  // from useOpenDocument. CommandGroup/CommandButton just look these up
  // by id, so this map applies regardless of which tab is active.
  const runHandlers = {
    "view.zoomIn": view.zoomIn,
    "view.zoomOut": view.zoomOut,
    "view.fitPage": () => view.setFitMode("page"),
    "view.fitWidth": () => view.setFitMode("width"),
    "view.nextPage": view.goToNextPage,
    "view.prevPage": view.goToPrevPage,
    "home.open": showOpenDialog,
  };
  const disabledReasons: Record<string, string> = {
    ...(view.canGoNext ? {} : { "view.nextPage": "No document open" }),
    ...(view.canGoPrev ? {} : { "view.prevPage": "No document open" }),
  };

  return (
    <div className="shrink-0 bg-surface">
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
          {selection !== "none" && <ContextualCommandGroup selection={selection} />}
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
