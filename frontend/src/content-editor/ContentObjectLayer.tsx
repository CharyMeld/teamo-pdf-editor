import { useRef, useState } from "react";
import type { ContentBox, ContentObject, TextObjectParams } from "../lib/api";
import Icon from "../components/ui/Icon";
import { DEFAULT_TEXT_PARAMS, useContentObjects } from "./useContentObjects";
import TextComposerPopover from "./TextComposerPopover";

const MIN_SIZE_PT = 8;
const HANDLES = ["nw", "ne", "sw", "se"] as const;
type Handle = (typeof HANDLES)[number];

interface Props {
  pageNumber: number;
  widthPt: number;
  heightPt: number;
  scale: number;
}

function toDeg(rad: number) {
  return (rad * 180) / Math.PI;
}
function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

/** Rotates a vector by `deg` degrees (screen convention: positive = the
 * visual clockwise direction our CSS `rotate()` also uses, so this and the
 * on-screen transform always agree). */
function rotateVec(x: number, y: number, deg: number) {
  const r = toRad(deg);
  return { x: x * Math.cos(r) - y * Math.sin(r), y: x * Math.sin(r) + y * Math.cos(r) };
}

/**
 * The real Phase 4 canvas interaction layer: one of these mounts on top of
 * the currently-viewed page's pdf.js canvas (see PdfViewer). Renders every
 * active content object as a positioned, selectable, draggable, resizable,
 * rotatable overlay, plus the click-and-drag placement UI for new text/
 * overlay-edit/image objects — the same interaction shape CropDialog
 * established for its crop box, generalized here to live, on-canvas editing
 * rather than a separate dialog preview. Every commit (pointerup after a
 * drag/resize/rotate, or confirming the text composer) calls a real backend
 * endpoint via useContentObjects — nothing here is client-side-only state
 * that silently disappears on reload.
 */
export default function ContentObjectLayer({ pageNumber, heightPt, scale }: Props) {
  const {
    objects,
    selectedId,
    selectObject,
    imagePreviewUrls,
    placementMode,
    cancelPlacing,
    commitTextPlacement,
    createImage,
    patchSelected,
    busy,
  } = useContentObjects();

  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const heightPx = heightPt * scale;

  const pageObjects = objects.filter((o) => o.page === pageNumber);

  // --- Live (uncommitted) visual override for whichever object is being
  // dragged/resized/rotated right now — keeps the drag buttery-smooth with
  // zero network calls per pixel; only the pointerup commits via PATCH.
  const [liveBox, setLiveBox] = useState<{ id: string; x: number; y: number; width: number; height: number; rotation: number } | null>(
    null,
  );
  const dragRef = useRef<{
    kind: "move" | "resize" | "rotate";
    objectId: string;
    handle?: Handle;
    startPointerPdf: { x: number; y: number };
    startObj: { x: number; y: number; width: number; height: number; rotation: number };
  } | null>(null);

  // --- Placement (new object) drag box.
  const placeDragStartRef = useRef<{ x: number; y: number } | null>(null);
  const [placeBox, setPlaceBox] = useState<ContentBox | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [pendingImageBox, setPendingImageBox] = useState<ContentBox | null>(null);

  function pointerToPdf(clientX: number, clientY: number): { x: number; y: number } {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    // Screen/pointer coordinates are top-left origin; PDF points are
    // bottom-left origin (same convention CropDialog established).
    return { x: px / scale, y: (heightPx - py) / scale };
  }

  // --- Background: click to deselect, or drag to place a new text/overlay
  // box (image placement also uses this box to size/position the insert).
  function handleBackgroundPointerDown(e: React.PointerEvent) {
    if (e.target !== e.currentTarget) return; // an object/handle handled it
    if (placementMode) {
      const p = pointerToPdf(e.clientX, e.clientY);
      placeDragStartRef.current = p;
      setPlaceBox({ x: p.x, y: p.y, width: 0, height: 0 });
      containerRef.current?.setPointerCapture(e.pointerId);
      return;
    }
    selectObject(null);
  }

  function handleBackgroundPointerMove(e: React.PointerEvent) {
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
        setLiveBox({
          id: dragRef.current.objectId,
          x: startObj.x + (cur.x - startPointerPdf.x),
          y: startObj.y + (cur.y - startPointerPdf.y),
          width: startObj.width,
          height: startObj.height,
          rotation: startObj.rotation,
        });
      } else if (kind === "resize" && handle) {
        const deltaPdf = { x: cur.x - startPointerPdf.x, y: cur.y - startPointerPdf.y };
        // Inverse-rotate the screen-space delta into the object's own local
        // (unrotated) axes so corner-anchored resize is correct even for a
        // rotated object.
        const deltaLocal = rotateVec(deltaPdf.x, deltaPdf.y, -startObj.rotation);
        const signX = handle === "ne" || handle === "se" ? 1 : -1;
        const signY = handle === "ne" || handle === "nw" ? 1 : -1;
        const newWidth = Math.max(MIN_SIZE_PT, startObj.width + deltaLocal.x * signX);
        const newHeight = Math.max(MIN_SIZE_PT, startObj.height + deltaLocal.y * signY);
        // Keep the opposite corner fixed: the center shifts by half the
        // (clamped) size change, in the local frame, then that shift is
        // rotated back into PDF space to find the new true center.
        const localShift = { x: (signX * (newWidth - startObj.width)) / 2, y: (signY * (newHeight - startObj.height)) / 2 };
        const worldShift = rotateVec(localShift.x, localShift.y, startObj.rotation);
        const startCenter = { x: startObj.x + startObj.width / 2, y: startObj.y + startObj.height / 2 };
        const newCenter = { x: startCenter.x + worldShift.x, y: startCenter.y + worldShift.y };
        setLiveBox({
          id: dragRef.current.objectId,
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
        // PDF space is y-up; the visual CSS transform below is y-down, so
        // the raw angle delta needs negating to keep "drag clockwise on
        // screen" and "rotates clockwise on screen" in agreement.
        const rotation = startObj.rotation - (curAngle - startAngle);
        setLiveBox({ id: dragRef.current.objectId, ...startObj, rotation });
      }
    }
  }

  async function handleBackgroundPointerUp(e: React.PointerEvent) {
    if (placeDragStartRef.current) {
      placeDragStartRef.current = null;
      containerRef.current?.releasePointerCapture(e.pointerId);
      if (placeBox && placeBox.width >= MIN_SIZE_PT && placeBox.height >= MIN_SIZE_PT) {
        if (placementMode === "image") {
          setPendingImageBox(placeBox);
          fileInputRef.current?.click();
        } else {
          setComposerOpen(true);
        }
      } else {
        setPlaceBox(null);
        cancelPlacing();
      }
      return;
    }
    if (dragRef.current && liveBox) {
      const { x, y, width, height, rotation } = liveBox;
      dragRef.current = null;
      setLiveBox(null);
      await patchSelected({ x, y, width, height, rotation });
    }
  }

  function startObjectDrag(kind: "move" | "resize" | "rotate", obj: ContentObject, handle?: Handle) {
    return (e: React.PointerEvent) => {
      e.stopPropagation();
      // While armed to place a NEW object, an existing object sitting under
      // the placement box must not hijack the gesture into moving/resizing
      // itself instead — the user is drawing, not editing. Ignoring this
      // click here silently drops it, which is correct: placement only
      // proceeds from a background pointerdown (handleBackgroundPointerDown
      // checks `e.target === e.currentTarget`), so overlapping an existing
      // object just means that pixel can't start a new placement drag.
      if (busy || placementMode) return;
      selectObject(obj.objectId);
      dragRef.current = {
        kind,
        objectId: obj.objectId,
        handle,
        startPointerPdf: pointerToPdf(e.clientX, e.clientY),
        startObj: { x: obj.x, y: obj.y, width: obj.width, height: obj.height, rotation: obj.rotation },
      };
      containerRef.current?.setPointerCapture(e.pointerId);
    };
  }

  function handleImageFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !pendingImageBox) return;
    void createImage(pageNumber, pendingImageBox, file);
    setPendingImageBox(null);
    setPlaceBox(null);
  }

  async function handleComposerConfirm(params: TextObjectParams) {
    if (!placeBox) return;
    await commitTextPlacement(placeBox, params);
    setComposerOpen(false);
    setPlaceBox(null);
  }

  function handleComposerCancel() {
    setComposerOpen(false);
    setPlaceBox(null);
    cancelPlacing();
  }

  const cursorClass = placementMode ? "cursor-crosshair" : "cursor-default";

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 select-none touch-none ${cursorClass}`}
      onPointerDown={handleBackgroundPointerDown}
      onPointerMove={handleBackgroundPointerMove}
      onPointerUp={(e) => void handleBackgroundPointerUp(e)}
    >
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageFileChosen} />

      {pageObjects.map((obj) => {
        const live = liveBox?.id === obj.objectId ? liveBox : null;
        const box = live ?? obj;
        const isSelected = selectedId === obj.objectId;
        const leftPx = box.x * scale;
        const topPx = heightPx - (box.y + box.height) * scale;
        const wPx = box.width * scale;
        const hPx = box.height * scale;
        const textParams = obj.type !== "image" ? (obj.params as TextObjectParams) : null;

        return (
          <div
            key={obj.objectId}
            data-content-object
            onPointerDown={startObjectDrag("move", obj)}
            className={[
              "absolute cursor-move overflow-hidden",
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
            {obj.type === "image" ? (
              imagePreviewUrls[obj.objectId] ? (
                <img
                  src={imagePreviewUrls[obj.objectId]}
                  alt=""
                  draggable={false}
                  className="h-full w-full object-fill"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-surface-muted text-text-subtle">
                  <Icon name="document" size={16} />
                </div>
              )
            ) : (
              <div
                className="h-full w-full overflow-hidden whitespace-pre-wrap break-words px-0.5"
                style={{
                  fontFamily: textParams?.font === "Times" ? "serif" : textParams?.font === "Courier" ? "monospace" : "sans-serif",
                  fontSize: (textParams?.fontSize ?? 12) * scale,
                  fontWeight: textParams?.bold ? 700 : 400,
                  fontStyle: textParams?.italic ? "italic" : "normal",
                  color: textParams?.color ?? "#111111",
                  textAlign: textParams?.align ?? "left",
                  lineHeight: textParams?.lineSpacing ?? 1.2,
                  backgroundColor: obj.type === "text_overlay_edit" ? "rgba(255,255,255,0.92)" : "transparent",
                }}
              >
                {textParams?.text}
              </div>
            )}

            {isSelected && (
              <>
                {HANDLES.map((h) => (
                  <div
                    key={h}
                    onPointerDown={startObjectDrag("resize", obj, h)}
                    className={[
                      "absolute h-2.5 w-2.5 rounded-sm border border-accent bg-surface",
                      h.includes("n") ? "-top-1.5" : "-bottom-1.5",
                      h.includes("w") ? "-left-1.5 cursor-nwse-resize" : "-right-1.5",
                      h === "ne" || h === "sw" ? "cursor-nesw-resize" : h === "nw" || h === "se" ? "cursor-nwse-resize" : "",
                    ].join(" ")}
                  />
                ))}
                <div
                  onPointerDown={startObjectDrag("rotate", obj)}
                  className="absolute left-1/2 -top-6 flex h-4 w-4 -translate-x-1/2 cursor-grab items-center justify-center rounded-full border border-accent bg-surface"
                  title="Rotate"
                >
                  <Icon name="rotate" size={10} />
                </div>
              </>
            )}
          </div>
        );
      })}

      {placeBox && placementMode && (
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

      {composerOpen && placeBox && (
        <TextComposerPopover
          box={placeBox}
          scale={scale}
          heightPx={heightPx}
          isOverlayEdit={placementMode === "editText"}
          initialParams={DEFAULT_TEXT_PARAMS}
          busy={busy}
          onConfirm={(p) => void handleComposerConfirm(p)}
          onCancel={handleComposerCancel}
        />
      )}
    </div>
  );
}
