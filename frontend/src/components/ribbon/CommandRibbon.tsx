import { useState } from "react";
import { useSelectionContext } from "../../commands/useSelectionContext";
import { useActiveTab } from "../../hooks/useActiveTab";
import { useDocumentViewState } from "../../hooks/useDocumentViewState";
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
  const isMobile = useMediaQuery(BREAKPOINTS.mobile);
  const [sheetOpen, setSheetOpen] = useState(false);

  // VIEW's zoom/fit/navigation commands are genuinely implemented — wire
  // their real handlers here, where useDocumentViewState lives.
  const viewRunHandlers = {
    "view.zoomIn": view.zoomIn,
    "view.zoomOut": view.zoomOut,
    "view.fitPage": () => view.setFitMode("page"),
    "view.fitWidth": () => view.setFitMode("width"),
    "view.nextPage": view.goToNextPage,
    "view.prevPage": view.goToPrevPage,
  };
  const viewDisabledReasons: Record<string, string> = {
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
          <CommandGroup
            activeTab={activeTab}
            runHandlers={activeTab === "VIEW" ? viewRunHandlers : undefined}
            disabledReasons={activeTab === "VIEW" ? viewDisabledReasons : undefined}
          />
          {selection !== "none" && <ContextualCommandGroup selection={selection} />}
        </div>
      )}

      {isMobile && (
        <MobileCommandSheet
          activeTab={activeTab}
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          runHandlers={activeTab === "VIEW" ? viewRunHandlers : {}}
        />
      )}
    </div>
  );
}
