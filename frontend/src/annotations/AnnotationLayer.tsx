import { useRef, useState } from "react";
import { useActiveTab } from "../hooks/useActiveTab";
import type {
  Annotation,
  ArrowAnnotationParams,
  FreehandAnnotationParams,
  FreehandPoint,
  MarkAnnotationParams,
  ShapeAnnotationParams,
  StampAnnotationParams,
  TextBoxAnnotationParams,
} from "../lib/api";
import Icon from "../components/ui/Icon";
import { useAnnotations } from "./useAnnotations";
import AnnotationTextComposerPopover from "./AnnotationTextComposerPopover";
import StampChooserPopover from "./StampChooserPopover";

const MIN_SIZE_PT = 8;
const STICKY_NOTE_SIZE_PT = 24;
const HANDLES = ["nw", "ne", "sw", "se"] as const;
type Handle = (typeof HANDLES)[number];

/** Types that support the standard move + 4-corner-resize + rotate
 * interaction, same as every Phase 4 content object. Arrow (two endpoint
 * handles instead of corners, no rotation — its own two points already
 * fully determine direction) and freehand (move + rotate only; resizing
 * would need to rescale every stored point, an honest scope limit for
 * this phase) are handled separately below. */
const STANDARD_HANDLE_TYPES = new Set<Annotation["type"]>([
  "highlight",
  "underline",
  "strikethrough",
  "rectangle",
  "circle",
  "text_box",
  "sticky_note",
  "stamp",
]);

interface Props {
  pageNumber: number;
  heightPt: number;
  scale: number;
}

function toDeg(rad: number) {
  return (rad * 180) / Math.PI;
}
function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}
function rotateVec(x: number, y: number, deg: number) {
  const r = toRad(deg);
  return { x: x * Math.cos(r) - y * Math.sin(r), y: x * Math.sin(r) + y * Math.cos(r) };
}

/**
 * The real Phase 5 canvas interaction layer — mounts alongside Phase 4's
 * ContentObjectLayer on top of the currently-viewed page's pdf.js canvas.
 * Renders every active annotation (each type its own small local `<svg>`
 * sized to its own bounding box with a viewBox in raw PDF points — so
 * stroke widths need no manual scale math, the SVG's own viewport scaling
 * handles it — except arrow, which ignores the generic box/rotation
 * treatment entirely since its own two points already fully determine its
 * visual direction), plus the placement UI for all 10 tools: click-and-
 * drag box placement (highlight/underline/strikethrough/rectangle/circle/
 * text_box/stamp), click-and-drag two-point placement (arrow), click-and-
 * drag freehand path sampling, and single-click placement (sticky_note).
 */
export default function AnnotationLayer({ pageNumber, heightPt, scale }: Props) {
  const {
    annotations,
    selectedId,
    selectAnnotation,
    imagePreviewUrls,
    stampPresets,
    placementMode,
    cancelPlacing,
    commitAnnotation,
    createStampImage,
    patchSelected,
    busy,
  } = useAnnotations();
  // See ContentObjectLayer's matching comment: two independent full-page
  // overlays need exactly one of them "live" for background clicks at a
  // time, gated by the active ribbon tab, while every individual
  // annotation's own wrapper below keeps `pointer-events-auto`
  // unconditionally so it stays clickable from either tab. SIGN's "Draw
  // Signature" command arms this exact same freehand placementMode while
  // SIGN is the active tab (see Phase 11's useSignatureRunHandlers), so
  // this layer must also count itself active in that specific case.
  const { activeTab } = useActiveTab();
  const isActiveLayer = activeTab === "ANNOTATE" || (activeTab === "SIGN" && placementMode === "freehand");

  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const heightPx = heightPt * scale;

  const pageAnnotations = annotations.filter((a) => a.page === pageNumber);

  const [liveBox, setLiveBox] = useState<{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    x2?: number;
    y2?: number;
  } | null>(null);
  const dragRef = useRef<{
    kind: "move" | "resize" | "rotate" | "arrow-tail" | "arrow-head";
    annotationId: string;
    handle?: Handle;
    startPointerPdf: { x: number; y: number };
    startObj: { x: number; y: number; width: number; height: number; rotation: number; x2?: number; y2?: number };
  } | null>(null);

  // --- Placement state: one of box-drag, arrow two-point drag, or freehand path.
  const placeDragStartRef = useRef<{ x: number; y: number } | null>(null);
  const [placeBox, setPlaceBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [arrowDrag, setArrowDrag] = useState<{ from: { x: number; y: number }; to: { x: number; y: number } } | null>(null);
  const [freehandPoints, setFreehandPoints] = useState<FreehandPoint[] | null>(null);
  const [textComposerOpen, setTextComposerOpen] = useState(false);
  const [stampChooserOpen, setStampChooserOpen] = useState(false);

  function pointerToPdf(clientX: number, clientY: number): { x: number; y: number } {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    return { x: px / scale, y: (heightPx - py) / scale };
  }

  function handleBackgroundPointerDown(e: React.PointerEvent) {
    if (e.target !== e.currentTarget) return;
    if (!placementMode) {
      selectAnnotation(null);
      return;
    }

    const p = pointerToPdf(e.clientX, e.clientY);

    if (placementMode === "sticky_note") {
      const half = STICKY_NOTE_SIZE_PT / 2;
      void commitAnnotation({ x: p.x - half, y: p.y - half, width: STICKY_NOTE_SIZE_PT, height: STICKY_NOTE_SIZE_PT });
      return;
    }
    if (placementMode === "freehand") {
      setFreehandPoints([p]);
      containerRef.current?.setPointerCapture(e.pointerId);
      return;
    }
    if (placementMode === "arrow") {
      setArrowDrag({ from: p, to: p });
      containerRef.current?.setPointerCapture(e.pointerId);
      return;
    }

    placeDragStartRef.current = p;
    setPlaceBox({ x: p.x, y: p.y, width: 0, height: 0 });
    containerRef.current?.setPointerCapture(e.pointerId);
  }

  function handleBackgroundPointerMove(e: React.PointerEvent) {
    if (freehandPoints) {
      const p = pointerToPdf(e.clientX, e.clientY);
      setFreehandPoints((prev) => (prev ? [...prev, p] : [p]));
      return;
    }
    if (arrowDrag) {
      const p = pointerToPdf(e.clientX, e.clientY);
      setArrowDrag((prev) => (prev ? { ...prev, to: p } : null));
      return;
    }
    if (placeDragStartRef.current) {
      const start = placeDragStartRef.current;
      const cur = pointerToPdf(e.clientX, e.clientY);
      setPlaceBox({
        x: Math.min(start.x, cur.x),
        y: Math.min(start.y, cur.y),
        width: Math.abs(cur.x - start.x),
        height: Math.abs(cur.y - start.y),
      });
      return;
    }
    if (dragRef.current) {
      const { kind, startPointerPdf, startObj, handle } = dragRef.current;
      const cur = pointerToPdf(e.clientX, e.clientY);

      if (kind === "move") {
        const dx = cur.x - startPointerPdf.x;
        const dy = cur.y - startPointerPdf.y;
        setLiveBox({
          id: dragRef.current.annotationId,
          x: startObj.x + dx,
          y: startObj.y + dy,
          width: startObj.width,
          height: startObj.height,
          rotation: startObj.rotation,
          x2: startObj.x2 !== undefined ? startObj.x2 + dx : undefined,
          y2: startObj.y2 !== undefined ? startObj.y2 + dy : undefined,
        });
      } else if (kind === "arrow-tail") {
        setLiveBox({
          id: dragRef.current.annotationId,
          x: cur.x,
          y: cur.y,
          width: Math.max(1, Math.abs((startObj.x2 ?? 0) - cur.x)),
          height: Math.max(1, Math.abs((startObj.y2 ?? 0) - cur.y)),
          rotation: 0,
          x2: startObj.x2,
          y2: startObj.y2,
        });
      } else if (kind === "arrow-head") {
        setLiveBox({
          id: dragRef.current.annotationId,
          x: startObj.x,
          y: startObj.y,
          width: Math.max(1, Math.abs(cur.x - startObj.x)),
          height: Math.max(1, Math.abs(cur.y - startObj.y)),
          rotation: 0,
          x2: cur.x,
          y2: cur.y,
        });
      } else if (kind === "resize" && handle) {
        const deltaPdf = { x: cur.x - startPointerPdf.x, y: cur.y - startPointerPdf.y };
        const deltaLocal = rotateVec(deltaPdf.x, deltaPdf.y, -startObj.rotation);
        const signX = handle === "ne" || handle === "se" ? 1 : -1;
        const signY = handle === "ne" || handle === "nw" ? 1 : -1;
        const newWidth = Math.max(MIN_SIZE_PT, startObj.width + deltaLocal.x * signX);
        const newHeight = Math.max(MIN_SIZE_PT, startObj.height + deltaLocal.y * signY);
        const localShift = { x: (signX * (newWidth - startObj.width)) / 2, y: (signY * (newHeight - startObj.height)) / 2 };
        const worldShift = rotateVec(localShift.x, localShift.y, startObj.rotation);
        const startCenter = { x: startObj.x + startObj.width / 2, y: startObj.y + startObj.height / 2 };
        const newCenter = { x: startCenter.x + worldShift.x, y: startCenter.y + worldShift.y };
        setLiveBox({
          id: dragRef.current.annotationId,
          x: newCenter.x - newWidth / 2,
          y: newCenter.y - newHeight / 2,
          width: newWidth,
          height: newHeight,
          rotation: startObj.rotation,
        });
      } else if (kind === "rotate") {
        const center = { x: startObj.x + startObj.width / 2, y: startObj.y + startObj.height / 2 };
        const startAngle = toDeg(Math.atan2(startPointerPdf.y - center.y, startPointerPdf.x - center.x));
        const curAngle = toDeg(Math.atan2(cur.y - center.y, cur.x - center.x));
        const rotation = startObj.rotation - (curAngle - startAngle);
        setLiveBox({ id: dragRef.current.annotationId, ...startObj, rotation });
      }
    }
  }

  async function handleBackgroundPointerUp(e: React.PointerEvent) {
    if (freehandPoints) {
      containerRef.current?.releasePointerCapture(e.pointerId);
      const points = freehandPoints;
      setFreehandPoints(null);
      if (points.length >= 2) {
        const xs = points.map((p) => p.x);
        const ys = points.map((p) => p.y);
        const box = {
          x: Math.min(...xs),
          y: Math.min(...ys),
          width: Math.max(1, Math.max(...xs) - Math.min(...xs)),
          height: Math.max(1, Math.max(...ys) - Math.min(...ys)),
        };
        await commitAnnotation(box, { params: { points } });
      } else {
        cancelPlacing();
      }
      return;
    }
    if (arrowDrag) {
      containerRef.current?.releasePointerCapture(e.pointerId);
      const { from, to } = arrowDrag;
      setArrowDrag(null);
      if (Math.hypot(to.x - from.x, to.y - from.y) >= MIN_SIZE_PT) {
        const box = { x: from.x, y: from.y, width: Math.max(1, Math.abs(to.x - from.x)), height: Math.max(1, Math.abs(to.y - from.y)) };
        await commitAnnotation(box, { x2: to.x, y2: to.y });
      } else {
        cancelPlacing();
      }
      return;
    }
    if (placeDragStartRef.current) {
      placeDragStartRef.current = null;
      containerRef.current?.releasePointerCapture(e.pointerId);
      if (placeBox && placeBox.width >= MIN_SIZE_PT && placeBox.height >= MIN_SIZE_PT) {
        if (placementMode === "text_box") {
          setTextComposerOpen(true);
        } else if (placementMode === "stamp") {
          setStampChooserOpen(true);
        } else {
          await commitAnnotation(placeBox);
        }
      } else {
        setPlaceBox(null);
        cancelPlacing();
      }
      return;
    }
    if (dragRef.current && liveBox) {
      const { x, y, width, height, rotation, x2, y2 } = liveBox;
      dragRef.current = null;
      setLiveBox(null);
      await patchSelected({ x, y, width, height, rotation, x2, y2 });
    }
  }

  function startDrag(kind: "move" | "resize" | "rotate" | "arrow-tail" | "arrow-head", a: Annotation, handle?: Handle) {
    return (e: React.PointerEvent) => {
      e.stopPropagation();
      if (busy || placementMode) return;
      selectAnnotation(a.annotationId, a.type);
      dragRef.current = {
        kind,
        annotationId: a.annotationId,
        handle,
        startPointerPdf: pointerToPdf(e.clientX, e.clientY),
        startObj: { x: a.x, y: a.y, width: a.width, height: a.height, rotation: a.rotation, x2: a.x2, y2: a.y2 },
      };
      containerRef.current?.setPointerCapture(e.pointerId);
    };
  }

  function handleStampFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !placeBox) return;
    void createStampImage(pageNumber, placeBox, file);
    setStampChooserOpen(false);
    setPlaceBox(null);
  }

  async function handleStampPresetChosen(presetKey: string) {
    if (!placeBox) return;
    setStampChooserOpen(false);
    await commitAnnotation(placeBox, { params: { stampKind: "preset", presetKey } });
    setPlaceBox(null);
  }

  async function handleTextConfirm(text: string) {
    if (!placeBox) return;
    await commitAnnotation(placeBox, { params: { text } });
    setTextComposerOpen(false);
    setPlaceBox(null);
  }

  function cancelBoxPopover() {
    setTextComposerOpen(false);
    setStampChooserOpen(false);
    setPlaceBox(null);
    cancelPlacing();
  }

  const cursorClass = placementMode ? "cursor-crosshair" : "cursor-default";

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 select-none touch-none ${cursorClass} ${isActiveLayer ? "" : "pointer-events-none"}`}
      onPointerDown={handleBackgroundPointerDown}
      onPointerMove={handleBackgroundPointerMove}
      onPointerUp={(e) => void handleBackgroundPointerUp(e)}
    >
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleStampFileChosen} />

      {pageAnnotations.map((a) => {
        const live = liveBox?.id === a.annotationId ? liveBox : null;
        const box = live ?? a;
        const isSelected = selectedId === a.annotationId;

        if (a.type === "arrow") {
          const tailX = live ? live.x : a.x;
          const tailY = live ? live.y : a.y;
          const headX = live ? (live.x2 ?? a.x2 ?? a.x) : (a.x2 ?? a.x);
          const headY = live ? (live.y2 ?? a.y2 ?? a.y) : (a.y2 ?? a.y);
          const params = a.params as ArrowAnnotationParams;
          const sx1 = tailX * scale;
          const sy1 = heightPx - tailY * scale;
          const sx2 = headX * scale;
          const sy2 = heightPx - headY * scale;
          const angle = Math.atan2(sy2 - sy1, sx2 - sx1);
          const headLen = Math.max(8, params.thickness * 4) * scale;
          const headW = Math.max(5, params.thickness * 2.5) * scale;
          const backX = sx2 - headLen * Math.cos(angle);
          const backY = sy2 - headLen * Math.sin(angle);
          const leftX = backX + headW * Math.cos(angle + Math.PI / 2);
          const leftY = backY + headW * Math.sin(angle + Math.PI / 2);
          const rightX = backX + headW * Math.cos(angle - Math.PI / 2);
          const rightY = backY + headW * Math.sin(angle - Math.PI / 2);

          return (
            <div key={a.annotationId} data-annotation className="absolute inset-0" style={{ pointerEvents: "none" }}>
              <svg className="absolute inset-0 h-full w-full overflow-visible" style={{ pointerEvents: "none" }}>
                <line x1={sx1} y1={sy1} x2={sx2} y2={sy2} stroke={params.color} strokeWidth={params.thickness * scale} />
                <polygon points={`${sx2},${sy2} ${leftX},${leftY} ${rightX},${rightY}`} fill={params.color} />
              </svg>
              <div
                onPointerDown={startDrag("move", a)}
                className={["absolute cursor-move", isSelected ? "ring-2 ring-accent" : ""].join(" ")}
                style={{
                  pointerEvents: "auto",
                  left: Math.min(sx1, sx2) - 6,
                  top: Math.min(sy1, sy2) - 6,
                  width: Math.abs(sx2 - sx1) + 12,
                  height: Math.abs(sy2 - sy1) + 12,
                }}
              />
              {isSelected && (
                <>
                  <div
                    onPointerDown={startDrag("arrow-tail", a)}
                    className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border border-accent bg-surface"
                    style={{ pointerEvents: "auto", left: sx1, top: sy1 }}
                  />
                  <div
                    onPointerDown={startDrag("arrow-head", a)}
                    className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border border-accent bg-surface"
                    style={{ pointerEvents: "auto", left: sx2, top: sy2 }}
                  />
                </>
              )}
            </div>
          );
        }

        const leftPx = box.x * scale;
        const topPx = heightPx - (box.y + box.height) * scale;
        const wPx = box.width * scale;
        const hPx = box.height * scale;
        const supportsResize = STANDARD_HANDLE_TYPES.has(a.type);

        return (
          <div
            key={a.annotationId}
            data-annotation
            onPointerDown={startDrag("move", a)}
            className={[
              "absolute cursor-move overflow-visible pointer-events-auto",
              isSelected ? "ring-2 ring-accent" : "ring-1 ring-transparent hover:ring-border-strong",
            ].join(" ")}
            style={{
              left: leftPx,
              top: topPx,
              width: wPx,
              height: hPx,
              transform: `rotate(${box.rotation}deg)`,
              transformOrigin: "center center",
            }}
          >
            <AnnotationVisual annotation={a} widthPt={box.width} heightPt={box.height} imagePreviewUrls={imagePreviewUrls} stampPresets={stampPresets} />

            {isSelected && supportsResize && (
              <>
                {HANDLES.map((h) => (
                  <div
                    key={h}
                    onPointerDown={startDrag("resize", a, h)}
                    className={[
                      "absolute h-2.5 w-2.5 rounded-sm border border-accent bg-surface",
                      h.includes("n") ? "-top-1.5" : "-bottom-1.5",
                      h.includes("w") ? "-left-1.5 cursor-nwse-resize" : "-right-1.5",
                      h === "ne" || h === "sw" ? "cursor-nesw-resize" : h === "nw" || h === "se" ? "cursor-nwse-resize" : "",
                    ].join(" ")}
                  />
                ))}
                <div
                  onPointerDown={startDrag("rotate", a)}
                  className="absolute left-1/2 -top-6 flex h-4 w-4 -translate-x-1/2 cursor-grab items-center justify-center rounded-full border border-accent bg-surface"
                  title="Rotate"
                >
                  <Icon name="rotate" size={10} />
                </div>
              </>
            )}
            {isSelected && a.type === "freehand" && (
              <div
                onPointerDown={startDrag("rotate", a)}
                className="absolute left-1/2 -top-6 flex h-4 w-4 -translate-x-1/2 cursor-grab items-center justify-center rounded-full border border-accent bg-surface"
                title="Rotate"
              >
                <Icon name="rotate" size={10} />
              </div>
            )}
          </div>
        );
      })}

      {/* Live in-progress placement previews */}
      {placeBox && placementMode && placementMode !== "sticky_note" && (
        <div
          className="pointer-events-none absolute border-2 border-dashed border-accent bg-accent-subtle/30"
          style={{
            left: placeBox.x * scale,
            top: heightPx - (placeBox.y + placeBox.height) * scale,
            width: placeBox.width * scale,
            height: placeBox.height * scale,
          }}
        />
      )}
      {arrowDrag && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
          <line
            x1={arrowDrag.from.x * scale}
            y1={heightPx - arrowDrag.from.y * scale}
            x2={arrowDrag.to.x * scale}
            y2={heightPx - arrowDrag.to.y * scale}
            stroke="#000"
            strokeWidth={2}
            strokeDasharray="4 3"
          />
        </svg>
      )}
      {freehandPoints && freehandPoints.length >= 2 && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
          <polyline
            points={freehandPoints.map((p) => `${p.x * scale},${heightPx - p.y * scale}`).join(" ")}
            fill="none"
            stroke="#EA580C"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}

      {textComposerOpen && placeBox && (
        <AnnotationTextComposerPopover
          box={placeBox}
          scale={scale}
          heightPx={heightPx}
          busy={busy}
          onConfirm={(text) => void handleTextConfirm(text)}
          onCancel={cancelBoxPopover}
        />
      )}
      {stampChooserOpen && placeBox && (
        <StampChooserPopover
          box={placeBox}
          scale={scale}
          heightPx={heightPx}
          presets={stampPresets}
          busy={busy}
          onChoosePreset={(key) => void handleStampPresetChosen(key)}
          onChooseImage={() => fileInputRef.current?.click()}
          onCancel={cancelBoxPopover}
        />
      )}
    </div>
  );
}

/** The visual representation for one annotation, sized to its own local
 * (0,0)-(widthPt,heightPt) box — an inline SVG viewBox in raw PDF points
 * for shape types (its own viewport scaling means stroke widths need no
 * manual multiply-by-scale math), or a plain styled div for text/sticky-
 * note/stamp, matching ContentObjectLayer's text/image rendering style. */
function AnnotationVisual({
  annotation,
  widthPt,
  heightPt,
  imagePreviewUrls,
  stampPresets,
}: {
  annotation: Annotation;
  widthPt: number;
  heightPt: number;
  imagePreviewUrls: Record<string, string>;
  stampPresets: Record<string, { label: string; color: string }>;
}) {
  const svgProps = {
    className: "absolute inset-0 h-full w-full",
    viewBox: `0 0 ${widthPt} ${heightPt}`,
    preserveAspectRatio: "none" as const,
  };

  switch (annotation.type) {
    case "highlight": {
      const p = annotation.params as MarkAnnotationParams;
      return (
        <svg {...svgProps}>
          <rect x={0} y={0} width={widthPt} height={heightPt} fill={p.color} fillOpacity={p.opacity ?? 0.4} />
        </svg>
      );
    }
    case "underline":
    case "strikethrough": {
      const p = annotation.params as MarkAnnotationParams;
      const y = annotation.type === "underline" ? heightPt - (p.thickness ?? 1.5) : heightPt / 2;
      return (
        <svg {...svgProps}>
          <line x1={0} y1={y} x2={widthPt} y2={y} stroke={p.color} strokeWidth={p.thickness ?? 1.5} />
        </svg>
      );
    }
    case "rectangle": {
      const p = annotation.params as ShapeAnnotationParams;
      return (
        <svg {...svgProps}>
          <rect
            x={p.strokeWidth / 2}
            y={p.strokeWidth / 2}
            width={Math.max(0, widthPt - p.strokeWidth)}
            height={Math.max(0, heightPt - p.strokeWidth)}
            fill={p.fillColor ?? "none"}
            fillOpacity={p.fillOpacity ?? 1}
            stroke={p.strokeColor}
            strokeWidth={p.strokeWidth}
          />
        </svg>
      );
    }
    case "circle": {
      const p = annotation.params as ShapeAnnotationParams;
      return (
        <svg {...svgProps}>
          <ellipse
            cx={widthPt / 2}
            cy={heightPt / 2}
            rx={Math.max(0, widthPt / 2 - p.strokeWidth / 2)}
            ry={Math.max(0, heightPt / 2 - p.strokeWidth / 2)}
            fill={p.fillColor ?? "none"}
            fillOpacity={p.fillOpacity ?? 1}
            stroke={p.strokeColor}
            strokeWidth={p.strokeWidth}
          />
        </svg>
      );
    }
    case "freehand": {
      const p = annotation.params as FreehandAnnotationParams;
      const points = p.points
        .map((pt) => `${pt.x - annotation.x},${heightPt - (pt.y - annotation.y)}`)
        .join(" ");
      return (
        <svg {...svgProps}>
          <polyline points={points} fill="none" stroke={p.color} strokeWidth={p.thickness} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    }
    case "text_box": {
      const p = annotation.params as TextBoxAnnotationParams;
      return (
        <div
          className="h-full w-full overflow-hidden whitespace-pre-wrap break-words px-0.5"
          style={{
            backgroundColor: p.backgroundColor ?? "transparent",
            border: p.borderColor ? `1px solid ${p.borderColor}` : undefined,
            fontFamily: p.font === "Times" ? "serif" : p.font === "Courier" ? "monospace" : "sans-serif",
            fontWeight: p.bold ? 700 : 400,
            fontStyle: p.italic ? "italic" : "normal",
            color: p.color,
            textAlign: p.align,
            lineHeight: p.lineSpacing,
            fontSize: Math.max(8, (p.fontSize * heightPt) / Math.max(heightPt, 1)),
          }}
        >
          {p.text}
        </div>
      );
    }
    case "sticky_note": {
      const p = annotation.params as { note: string; color: string };
      return (
        <div
          title={p.note || "Sticky note"}
          className="flex h-full w-full items-center justify-center rounded-sm"
          style={{ backgroundColor: p.color, clipPath: "polygon(0 0, 70% 0, 100% 30%, 100% 100%, 0 100%)" }}
        >
          <Icon name="stickyNote" size={12} />
        </div>
      );
    }
    case "stamp": {
      const p = annotation.params as StampAnnotationParams;
      if (p.stampKind === "image") {
        const preview = imagePreviewUrls[annotation.annotationId];
        return preview ? (
          <img src={preview} alt="" draggable={false} className="h-full w-full object-fill" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-surface-muted text-text-subtle">
            <Icon name="stamp" size={16} />
          </div>
        );
      }
      const preset = stampPresets[p.presetKey ?? "approved"];
      return (
        <div
          className="flex h-full w-full items-center justify-center rounded border-2 text-center text-xs font-bold"
          style={{ borderColor: preset?.color ?? "#000", color: preset?.color ?? "#000" }}
        >
          {preset?.label ?? "STAMP"}
        </div>
      );
    }
    default:
      return null;
  }
}
