import PdfCanvas from "./PdfCanvas";
import SmartInspector from "./SmartInspector";
import ThumbnailPanel from "./ThumbnailPanel";

// Fixed-width side panels for Phase 1 — true drag-to-resize is deferred
// (see ARCHITECTURE.md). ThumbnailPanel/SmartInspector each own their own
// desktop-docked vs. tablet/mobile-drawer behavior via useMediaQuery +
// usePanelVisibility, so this container stays a plain three-way flex row.
export default function DocumentWorkspace() {
  return (
    <div className="flex min-h-0 flex-1">
      <ThumbnailPanel />
      <PdfCanvas />
      <SmartInspector />
    </div>
  );
}
