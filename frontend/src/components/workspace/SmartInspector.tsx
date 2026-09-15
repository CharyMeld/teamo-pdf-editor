import { useSelectionContext } from "../../commands/useSelectionContext";
import { usePanelVisibility } from "../../hooks/usePanelVisibility";
import { BREAKPOINTS, useMediaQuery } from "../../hooks/useMediaQuery";
import IconButton from "../ui/IconButton";
import DevSelectionSimulator from "./DevSelectionSimulator";
import DocumentPanel from "./panels/DocumentPanel";
import PagePanel from "./panels/PagePanel";
import PropertiesPanel from "./panels/PropertiesPanel";
import SelectionPanel from "./panels/SelectionPanel";

function InspectorBody() {
  const { selection } = useSelectionContext();

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-surface-muted">
      <DevSelectionSimulator />
      {selection === "none" && <DocumentPanel />}
      {selection === "page" && <PagePanel />}
      {(selection === "text" || selection === "image" || selection === "annotation") && (
        <SelectionPanel kind={selection} />
      )}
      <PropertiesPanel />
    </div>
  );
}

/** RIGHT pane: the Smart Inspector. Which panel renders is driven by real
 * state (useSelectionContext) — Document / Page / Selection / Properties,
 * per the spec. On tablet/mobile it's an off-canvas drawer rather than a
 * docked pane. */
export default function SmartInspector() {
  const isTablet = useMediaQuery(BREAKPOINTS.tablet);
  const { inspectorOpen, closeInspector } = usePanelVisibility();

  if (!isTablet) {
    return (
      <aside className="w-64 shrink-0 border-l border-border">
        <InspectorBody />
      </aside>
    );
  }

  if (!inspectorOpen) return null;

  return (
    <div className="fixed inset-0 z-30 flex justify-end" onClick={closeInspector}>
      <div className="absolute inset-0 bg-black/30" />
      <aside
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 flex h-full w-72 flex-col border-l border-border bg-surface shadow-lg"
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-xs font-semibold text-text-muted">Smart Inspector</span>
          <IconButton icon="close" label="Close inspector" onClick={closeInspector} size="sm" />
        </div>
        <InspectorBody />
      </aside>
    </div>
  );
}
