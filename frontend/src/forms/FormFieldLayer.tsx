import { useRef, useState } from "react";
import { useActiveTab } from "../hooks/useActiveTab";
import type { FormField } from "../lib/api";
import { useFormFields } from "./useFormFields";

const MIN_SIZE_PT = 8;
const HANDLES = ["nw", "ne", "sw", "se"] as const;
type Handle = (typeof HANDLES)[number];

interface Props {
  pageNumber: number;
  heightPt: number;
  scale: number;
}

/** A short, type-appropriate visual preview drawn INSIDE the app only —
 * the real widget appearance is whatever `FormFieldEngine`/TCPDF actually
 * baked into the PDF; this is just enough for the user to tell field
 * types apart while designing. */
function FieldPreview({ field }: { field: FormField }) {
  switch (field.type) {
    case "checkbox":
      return <span className="text-sm">☐</span>;
    case "radio":
      return <span className="text-sm">○</span>;
    case "dropdown":
      return <span className="truncate px-1 text-[10px] text-text-muted">▾ Dropdown</span>;
    case "date":
      return <span className="truncate px-1 text-[10px] text-text-muted">Date</span>;
    case "signature":
      return <span className="truncate px-1 text-[10px] italic text-text-subtle">Sign here</span>;
    case "text":
    default:
      return <span className="truncate px-1 text-[10px] text-text-muted">Text field</span>;
  }
}

/**
 * Phase 10's canvas interaction layer — mirrors `ContentObjectLayer`'s
 * shape (move/resize via drag, click-and-drag placement for new fields),
 * simplified: no rotate-drag handle (rotation is a plain numeric Smart
 * Inspector field, since form widgets are rarely rotated and a real PDF
 * viewer renders them axis-aligned regardless of any design-time preview
 * rotation applied here). Every commit calls a real backend endpoint via
 * `useFormFields` — nothing here is client-side-only state.
 */
export default function FormFieldLayer({ pageNumber, heightPt, scale }: Props) {
  const { fields, selectedId, selectField, placementMode, cancelPlacing, commitPlacement, patchSelected, busy } =
    useFormFields();
  const { activeTab } = useActiveTab();
  const isActiveLayer = activeTab === "FORMS";

  const containerRef = useRef<HTMLDivElement>(null);
  const heightPx = heightPt * scale;
  const pageFields = fields.filter((f) => f.page === pageNumber);

  const [liveBox, setLiveBox] = useState<{ id: string; x: number; y: number; width: number; height: number } | null>(
    null,
  );
  const dragRef = useRef<{
    kind: "move" | "resize";
    fieldId: string;
    handle?: Handle;
    startPointerPdf: { x: number; y: number };
    startField: { x: number; y: number; width: number; height: number };
  } | null>(null);

  const placeDragStartRef = useRef<{ x: number; y: number } | null>(null);
  const [placeBox, setPlaceBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  function pointerToPdf(clientX: number, clientY: number): { x: number; y: number } {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const px = clientX - rect.left;
    const py = clientY - rect.top;

    return { x: px / scale, y: (heightPx - py) / scale };
  }

  function handleBackgroundPointerDown(e: React.PointerEvent) {
    if (e.target !== e.currentTarget) return;
    if (placementMode) {
      const p = pointerToPdf(e.clientX, e.clientY);
      placeDragStartRef.current = p;
      setPlaceBox({ x: p.x, y: p.y, width: 0, height: 0 });
      containerRef.current?.setPointerCapture(e.pointerId);

      return;
    }
    selectField(null);
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
      const { kind, startPointerPdf, startField, handle } = dragRef.current;
      const cur = pointerToPdf(e.clientX, e.clientY);

      if (kind === "move") {
        setLiveBox({
          id: dragRef.current.fieldId,
          x: startField.x + (cur.x - startPointerPdf.x),
          y: startField.y + (cur.y - startPointerPdf.y),
          width: startField.width,
          height: startField.height,
        });
      } else if (kind === "resize" && handle) {
        const deltaX = cur.x - startPointerPdf.x;
        const deltaY = cur.y - startPointerPdf.y;
        const signX = handle === "ne" || handle === "se" ? 1 : -1;
        const signY = handle === "ne" || handle === "nw" ? 1 : -1;
        const newWidth = Math.max(MIN_SIZE_PT, startField.width + deltaX * signX);
        const newHeight = Math.max(MIN_SIZE_PT, startField.height + deltaY * signY);
        const newX = signX === 1 ? startField.x : startField.x + (startField.width - newWidth);
        const newY = signY === 1 ? startField.y : startField.y + (startField.height - newHeight);
        setLiveBox({ id: dragRef.current.fieldId, x: newX, y: newY, width: newWidth, height: newHeight });
      }
    }
  }

  async function handleBackgroundPointerUp(e: React.PointerEvent) {
    if (placeDragStartRef.current) {
      placeDragStartRef.current = null;
      containerRef.current?.releasePointerCapture(e.pointerId);
      if (placeBox && placeBox.width >= MIN_SIZE_PT && placeBox.height >= MIN_SIZE_PT) {
        await commitPlacement(pageNumber, placeBox);
      } else {
        cancelPlacing();
      }
      setPlaceBox(null);

      return;
    }
    if (dragRef.current && liveBox) {
      const { x, y, width, height } = liveBox;
      dragRef.current = null;
      setLiveBox(null);
      await patchSelected({ x, y, width, height });
    }
  }

  function startFieldDrag(kind: "move" | "resize", field: FormField, handle?: Handle) {
    return (e: React.PointerEvent) => {
      e.stopPropagation();
      if (busy || placementMode) return;
      selectField(field.fieldId);
      dragRef.current = {
        kind,
        fieldId: field.fieldId,
        handle,
        startPointerPdf: pointerToPdf(e.clientX, e.clientY),
        startField: { x: field.x, y: field.y, width: field.width, height: field.height },
      };
      containerRef.current?.setPointerCapture(e.pointerId);
    };
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
      {pageFields.map((field) => {
        const live = liveBox?.id === field.fieldId ? liveBox : null;
        const box = live ?? field;
        const isSelected = selectedId === field.fieldId;
        const leftPx = box.x * scale;
        const topPx = heightPx - (box.y + box.height) * scale;
        const wPx = box.width * scale;
        const hPx = box.height * scale;

        return (
          <div
            key={field.fieldId}
            onPointerDown={startFieldDrag("move", field)}
            className={[
              "absolute flex cursor-move items-center justify-center overflow-hidden border pointer-events-auto",
              field.type === "signature" ? "border-dashed border-text-subtle bg-transparent" : "border-border-strong bg-accent-subtle/20",
              isSelected ? "ring-2 ring-accent" : "ring-1 ring-transparent hover:ring-border-strong",
            ].join(" ")}
            style={{
              left: leftPx,
              top: topPx,
              width: wPx,
              height: hPx,
              transform: field.rotation ? `rotate(${field.rotation}deg)` : undefined,
              transformOrigin: "center center",
            }}
          >
            <FieldPreview field={field} />

            {isSelected &&
              HANDLES.map((h) => (
                <div
                  key={h}
                  onPointerDown={startFieldDrag("resize", field, h)}
                  className={[
                    "absolute h-2.5 w-2.5 rounded-sm border border-accent bg-surface",
                    h.includes("n") ? "-top-1.5" : "-bottom-1.5",
                    h.includes("w") ? "-left-1.5 cursor-nwse-resize" : "-right-1.5",
                    h === "ne" || h === "sw" ? "cursor-nesw-resize" : "cursor-nwse-resize",
                  ].join(" ")}
                />
              ))}
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
    </div>
  );
}
