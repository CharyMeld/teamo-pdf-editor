import PdfCanvas from "./PdfCanvas";
import SmartInspector from "./SmartInspector";
import ThumbnailPanel from "./ThumbnailPanel";

export default function DocumentWorkspace() {
  return (
    <div className="flex min-h-0 flex-1">
      <ThumbnailPanel />
      <PdfCanvas />
      <SmartInspector />
    </div>
  );
}
