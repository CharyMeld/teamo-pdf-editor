import { useEffect, useRef, useState } from "react";
import { useOpenDocument } from "../../hooks/useOpenDocument";
import { useWorkingDocument } from "../../hooks/useWorkingDocument";
import type { CropBox } from "../../lib/api";
import Button from "../ui/Button";
import Dialog from "../ui/Dialog";
import Spinner from "../ui/Spinner";

const MAX_PREVIEW_WIDTH = 300;
const MAX_PREVIEW_HEIGHT = 380;

/**
 * Real crop-box selection: renders the actual target page (via the same
 * pdf.js document useOpenDocument already loaded — no second fetch) into a
 * preview canvas, then lets the user drag a rectangle on top of it. The
 * drag updates a single canonical PDF-point box (bottom-left origin,
 * matching POST .../operations/crop's contract exactly) which is also
 * editable directly via the numeric fields below the preview — both are
 * two genuinely wired views of the same state, not a fake overlay with no
 * effect.
 */
export default function CropDialog() {
  const working = useWorkingDocument();
  const { pdfDoc, pages } = useOpenDocument();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  const targetPage = working.cropTargetPages[0] ?? null;
  const pageMeta = pages.find((p) => p.pageNumber === targetPage);

  // Purely derived from pageMeta — computed during render, not via effect
  // (there's nothing external to synchronize here, just arithmetic).
  const previewScale = pageMeta
    ? Math.min(MAX_PREVIEW_WIDTH / pageMeta.widthPt, MAX_PREVIEW_HEIGHT / pageMeta.heightPt)
    : 1;
  const previewHeightPx = pageMeta ? pageMeta.heightPt * previewScale : 0;

  const [box, setBox] = useState<CropBox | null>(null);
  const [rendered, setRendered] = useState(false);

  // Reset the crop box when the dialog opens for a *different* target page
  // — the same "adjust state during render" pattern StatusBar's
  // PageJumpInput already uses, rather than an extra effect just to mirror
  // a value.
  const [syncedTargetPage, setSyncedTargetPage] = useState<number | null>(null);
  if (working.cropDialogOpen && targetPage !== syncedTargetPage && pageMeta) {
    setSyncedTargetPage(targetPage);
    setBox({ x: 0, y: 0, width: pageMeta.widthPt, height: pageMeta.heightPt });
    setRendered(false);
  }

  // Render the real page into the preview canvas whenever the dialog opens
  // for a new target page — this part is a genuine external side effect
  // (pdf.js's async page render), so it stays in an effect.
  useEffect(() => {
    if (!working.cropDialogOpen || !pdfDoc || !targetPage || !pageMeta) return;
    let cancelled = false;

    pdfDoc.getPage(targetPage).then((page) => {
      if (cancelled) return;
      const viewport = page.getViewport({ scale: previewScale });
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const context = canvas.getContext("2d");
      if (!context) return;
      page.render({ canvasContext: context, viewport }).promise.then(() => {
        if (!cancelled) setRendered(true);
      });
    });

    return () => {
      cancelled = true;
    };
  }, [working.cropDialogOpen, pdfDoc, targetPage, pageMeta, previewScale]);

  function pointerToPdf(clientX: number, clientY: number): { x: number; y: number } {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || !pageMeta) return { x: 0, y: 0 };
    const px = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const py = Math.max(0, Math.min(rect.height, clientY - rect.top));
    // Canvas/pointer coordinates are top-left origin; PDF points are
    // bottom-left origin — the Y flip below is what makes the box we send
    // match the backend's real coordinate convention (see
    // ARCHITECTURE.md's crop endpoint contract).
    return { x: px / previewScale, y: (previewHeightPx - py) / previewScale };
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (!pageMeta) return;
    const point = pointerToPdf(e.clientX, e.clientY);
    dragStartRef.current = point;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    const start = dragStartRef.current;
    if (!start || !pageMeta) return;
    const current = pointerToPdf(e.clientX, e.clientY);
    const x = Math.min(start.x, current.x);
    const y = Math.min(start.y, current.y);
    const width = Math.abs(current.x - start.x);
    const height = Math.abs(current.y - start.y);
    setBox({ x, y, width, height });
  }

  function handlePointerUp() {
    dragStartRef.current = null;
  }

  function updateField(field: keyof CropBox, value: string) {
    const num = Number.parseFloat(value);
    if (!Number.isFinite(num)) return;
    setBox((prev) => ({ ...(prev ?? { x: 0, y: 0, width: 0, height: 0 }), [field]: Math.max(0, num) }));
  }

  const overlayStyle = box
    ? {
        left: box.x * previewScale,
        top: previewHeightPx - (box.y + box.height) * previewScale,
        width: box.width * previewScale,
        height: box.height * previewScale,
      }
    : undefined;

  const valid = !!box && box.width > 0 && box.height > 0;

  return (
    <Dialog open={working.cropDialogOpen} onClose={working.closeCropDialog} title={`Crop page ${targetPage ?? ""}`}>
      <div className="flex flex-col gap-3">
        <p className="text-xs text-text-muted">Drag on the preview to define the crop area.</p>

        <div
          ref={containerRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="relative mx-auto touch-none select-none border border-border bg-white shadow-sm"
          style={{ width: pageMeta ? pageMeta.widthPt * previewScale : MAX_PREVIEW_WIDTH, height: previewHeightPx }}
        >
          {!rendered && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Spinner label="Rendering preview" />
            </div>
          )}
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
          {box && rendered && (
            <div
              className="absolute border-2 border-accent bg-accent-subtle/30"
              style={overlayStyle}
              aria-hidden="true"
            />
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs text-text-muted">
          {(["x", "y", "width", "height"] as const).map((field) => (
            <label key={field} className="flex flex-col gap-1">
              {field} (pt)
              <input
                type="number"
                min={0}
                value={box ? Math.round(box[field]) : 0}
                onChange={(e) => updateField(field, e.target.value)}
                className="h-7 rounded border border-border bg-surface px-1.5 text-text"
              />
            </label>
          ))}
        </div>

        {working.busy ? (
          <div className="flex items-center justify-center py-2">
            <Spinner label={working.busyLabel ?? "Cropping…"} />
          </div>
        ) : (
          <Button
            variant="primary"
            size="sm"
            disabled={!valid}
            onClick={() => {
              if (!box) return;
              void working.runCrop(working.cropTargetPages, box).then(() => working.closeCropDialog());
            }}
          >
            Apply crop
          </Button>
        )}
      </div>
    </Dialog>
  );
}
