import { useEffect, useRef } from "react";
import type { StampPreset } from "../lib/api";
import Button from "../components/ui/Button";
import Spinner from "../components/ui/Spinner";
import { StampPresetPicker } from "./AnnotationStyleFields";

interface Props {
  box: { x: number; y: number; width: number; height: number };
  scale: number;
  heightPx: number;
  presets: Record<string, StampPreset>;
  busy: boolean;
  onChoosePreset: (key: string) => void;
  onChooseImage: () => void;
  onCancel: () => void;
}

/** After drawing a stamp's placement box: pick a built-in preset badge, or
 * upload a custom image — the same "the drawn box just needs one more
 * piece of input before it can be created" pattern the text box composer
 * uses, for stamp's two real variants (see PdfAnnotationEngine's docblock
 * for the preset-vs-image distinction). */
export default function StampChooserPopover({ box, scale, heightPx, presets, busy, onChoosePreset, onChooseImage, onCancel }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    containerRef.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
  }, []);

  const left = box.x * scale;
  const top = heightPx - (box.y + box.height) * scale;
  const popoverBelow = top + box.height * scale + 160 < heightPx;

  return (
    <div
      ref={containerRef}
      className="absolute z-20 w-64 rounded-md border border-border bg-surface p-2 shadow-lg"
      style={{ left, top: popoverBelow ? top + box.height * scale + 4 : Math.max(0, top - 164) }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-subtle">Choose a stamp</p>
      <StampPresetPicker presets={presets} selectedKey="" onSelect={onChoosePreset} disabled={busy} />
      <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
        <Button size="sm" variant="secondary" onClick={onChooseImage} disabled={busy}>
          Upload image…
        </Button>
        {busy ? <Spinner size={14} label="Adding…" /> : <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>}
      </div>
    </div>
  );
}
