import { useRef, useState } from "react";
import type { ScanImageCrop, ScanImageParams, ScanSessionImage } from "../lib/api";
import Icon from "../components/ui/Icon";
import IconButton from "../components/ui/IconButton";

const MAX_PREVIEW_SIZE = 420;

interface Props {
  image: ScanSessionImage;
  previewSrc: string | undefined;
  busy: boolean;
  onChange: (patch: Partial<ScanSessionImage["params"]>) => void;
}

/**
 * The real CLEAN step controls for one selected image: rotate, deskew,
 * a crop-box drag overlay directly on the live processed preview, and
 * brightness/contrast/sharpen/noise-reduction/background-cleanup —
 * every change PATCHes this image's params (see useScanWorkflow) and the
 * caller refetches the processed preview, so what's shown is always the
 * real backend output, never a client-side CSS filter approximation.
 *
 * Crop coordinates are TOP-LEFT-origin pixels (the preview image's own
 * natural pixel space AFTER whatever rotation/deskew is already applied —
 * matching ScanImageProcessor's pipeline order — see lib/api.ts's
 * ScanImageCrop docblock), deliberately NOT the bottom-left PDF-point
 * convention Phase 3/4/5's crop/object endpoints use.
 */
export default function ScanImageEditorPanel({ image, previewSrc, busy, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [liveCrop, setLiveCrop] = useState<ScanImageCrop | null>(null);

  // Optimistic local overlay on top of `image.params`, reset only when the
  // SELECTED IMAGE changes — every control here is a controlled input
  // bound to a prop that only actually updates once its PATCH round-trip
  // resolves; without this, React's own re-render (which happens
  // synchronously on the same click, before that network response lands)
  // snaps a checkbox/slider straight back to its old value for the
  // duration of the request, a visible flicker-back real users would
  // reasonably read as "my click didn't work."
  const [selectedImageId, setSelectedImageId] = useState(image.id);
  const [localParams, setLocalParams] = useState<ScanImageParams | null>(null);
  if (image.id !== selectedImageId) {
    setSelectedImageId(image.id);
    setLocalParams(null);
  }

  const params = localParams ?? image.params;

  function applyChange(patch: Partial<ScanImageParams>) {
    setLocalParams({ ...params, ...patch });
    onChange(patch);
  }
  const scale = naturalSize ? Math.min(MAX_PREVIEW_SIZE / naturalSize.width, MAX_PREVIEW_SIZE / naturalSize.height, 1) : 1;
  const displayWidth = naturalSize ? naturalSize.width * scale : MAX_PREVIEW_SIZE;
  const displayHeight = naturalSize ? naturalSize.height * scale : MAX_PREVIEW_SIZE;

  function pointerToImagePx(clientX: number, clientY: number): { x: number; y: number } {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const px = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const py = Math.max(0, Math.min(rect.height, clientY - rect.top));
    return { x: px / scale, y: py / scale };
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (busy) return;
    const point = pointerToImagePx(e.clientX, e.clientY);
    dragStartRef.current = point;
    setLiveCrop({ x: point.x, y: point.y, width: 0, height: 0 });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    const start = dragStartRef.current;
    if (!start) return;
    const cur = pointerToImagePx(e.clientX, e.clientY);
    setLiveCrop({
      x: Math.min(start.x, cur.x),
      y: Math.min(start.y, cur.y),
      width: Math.abs(cur.x - start.x),
      height: Math.abs(cur.y - start.y),
    });
  }

  function handlePointerUp() {
    dragStartRef.current = null;
    if (liveCrop && liveCrop.width > 8 && liveCrop.height > 8) {
      applyChange({ crop: liveCrop });
    }
  }

  const crop = liveCrop ?? params.crop;

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="relative mx-auto touch-none select-none overflow-hidden border border-border bg-surface-muted"
        style={{ width: displayWidth, height: displayHeight }}
      >
        {previewSrc && (
          <img
            src={previewSrc}
            alt=""
            draggable={false}
            className="pointer-events-none absolute inset-0 h-full w-full object-fill"
            onLoad={(e) => setNaturalSize({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
          />
        )}
        {crop && (
          <div
            className="pointer-events-none absolute border-2 border-accent bg-accent-subtle/30"
            style={{ left: crop.x * scale, top: crop.y * scale, width: crop.width * scale, height: crop.height * scale }}
          />
        )}
      </div>
      <p className="text-center text-[11px] text-text-subtle">Drag on the preview to crop.</p>

      <div className="flex items-center justify-center gap-1.5">
        <IconButton
          icon="rotate"
          label="Rotate left"
          disabled={busy}
          onClick={() => applyChange({ rotationDegrees: normalizeRotation(params.rotationDegrees - 90) })}
        />
        <IconButton
          icon="rotate"
          label="Rotate right"
          disabled={busy}
          onClick={() => applyChange({ rotationDegrees: normalizeRotation(params.rotationDegrees + 90) })}
        />
        {params.crop && (
          <IconButton icon="close" label="Clear crop" disabled={busy} onClick={() => { setLiveCrop(null); applyChange({ crop: null }); }} />
        )}
      </div>

      <label className="flex items-center justify-between gap-2 text-xs text-text-muted">
        <span className="flex items-center gap-1.5"><Icon name="crop" size={14} /> Deskew (straighten a crooked scan)</span>
        <input type="checkbox" checked={params.deskew} disabled={busy} onChange={(e) => applyChange({ deskew: e.target.checked })} />
      </label>
      <label className="flex items-center justify-between gap-2 text-xs text-text-muted">
        Clean background to white
        <input
          type="checkbox"
          checked={params.backgroundCleanup}
          disabled={busy}
          onChange={(e) => applyChange({ backgroundCleanup: e.target.checked })}
        />
      </label>

      <SliderField label="Brightness" value={params.brightness} min={-100} max={100} disabled={busy} onChange={(brightness) => applyChange({ brightness })} />
      <SliderField label="Contrast" value={params.contrast} min={-100} max={100} disabled={busy} onChange={(contrast) => applyChange({ contrast })} />
      <SliderField label="Sharpen" value={params.sharpen} min={0} max={100} disabled={busy} onChange={(sharpen) => applyChange({ sharpen })} />
      <SliderField
        label="Noise reduction"
        value={params.noiseReduction}
        min={0}
        max={100}
        disabled={busy}
        onChange={(noiseReduction) => applyChange({ noiseReduction })}
      />

      <label className="flex items-center justify-between gap-2 border-t border-border pt-2 text-xs text-text-muted">
        Exclude this page from the PDF
        {image.blankPageDetected && (
          <span className="rounded bg-warning-subtle px-1.5 py-0.5 text-[10px] font-semibold text-warning">Looks blank</span>
        )}
        <input type="checkbox" checked={params.excluded} disabled={busy} onChange={(e) => applyChange({ excluded: e.target.checked })} />
      </label>
    </div>
  );
}

function normalizeRotation(value: number): 0 | 90 | 180 | 270 | -90 {
  const normalized = ((value % 360) + 360) % 360;
  if (normalized === 0) return 0;
  if (normalized === 90) return 90;
  if (normalized === 180) return 180;
  if (normalized === 270) return 270;
  return 0;
}

function SliderField({
  label,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-text-muted">
      <span className="flex items-center justify-between">
        {label}
        <span className="text-text-subtle">{value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
    </label>
  );
}
