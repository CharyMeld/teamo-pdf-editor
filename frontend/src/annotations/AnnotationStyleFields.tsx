import type { StampPreset } from "../lib/api";

/** A labeled color swatch — the one primitive every style-field group below
 * is built from, so a color picker never looks or behaves differently
 * between annotation types. */
export function ColorField({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-[11px] text-text-muted">
      {label}
      <input
        type="color"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-6 w-10 cursor-pointer rounded border border-border bg-bg p-0.5"
      />
    </label>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 0.5,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-[11px] text-text-muted">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const n = Number.parseFloat(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
        className="h-6 w-16 rounded border border-border bg-bg px-1 text-text"
      />
    </label>
  );
}

/** highlight (opacity) / underline & strikethrough (thickness). */
export function MarkStyleFields({
  type,
  params,
  onChange,
  disabled = false,
}: {
  type: "highlight" | "underline" | "strikethrough";
  params: { color: string; opacity?: number; thickness?: number };
  onChange: (next: Record<string, unknown>) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <ColorField label="Color" value={params.color} onChange={(color) => onChange({ color })} disabled={disabled} />
      {type === "highlight" ? (
        <NumberField
          label="Opacity"
          value={params.opacity ?? 0.4}
          min={0.1}
          max={1}
          step={0.1}
          onChange={(opacity) => onChange({ opacity })}
          disabled={disabled}
        />
      ) : (
        <NumberField
          label="Thickness"
          value={params.thickness ?? 1.5}
          min={0.5}
          max={20}
          onChange={(thickness) => onChange({ thickness })}
          disabled={disabled}
        />
      )}
    </div>
  );
}

/** rectangle / circle: stroke always, optional fill. */
export function ShapeStyleFields({
  params,
  onChange,
  disabled = false,
}: {
  params: { strokeColor: string; strokeWidth: number; fillColor?: string; fillOpacity?: number };
  onChange: (next: Record<string, unknown>) => void;
  disabled?: boolean;
}) {
  const hasFill = !!params.fillColor;
  return (
    <div className="flex flex-col gap-1.5">
      <ColorField label="Stroke" value={params.strokeColor} onChange={(strokeColor) => onChange({ strokeColor })} disabled={disabled} />
      <NumberField
        label="Stroke width"
        value={params.strokeWidth}
        min={0.5}
        max={20}
        onChange={(strokeWidth) => onChange({ strokeWidth })}
        disabled={disabled}
      />
      <label className="flex items-center justify-between gap-2 text-[11px] text-text-muted">
        Fill
        <input
          type="checkbox"
          checked={hasFill}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked ? { fillColor: params.strokeColor, fillOpacity: 1 } : { fillColor: null })}
        />
      </label>
      {hasFill && (
        <>
          <ColorField label="Fill color" value={params.fillColor ?? "#000000"} onChange={(fillColor) => onChange({ fillColor })} disabled={disabled} />
          <NumberField
            label="Fill opacity"
            value={params.fillOpacity ?? 1}
            min={0.1}
            max={1}
            step={0.1}
            onChange={(fillOpacity) => onChange({ fillOpacity })}
            disabled={disabled}
          />
        </>
      )}
    </div>
  );
}

/** freehand / arrow: a single color + thickness. */
export function LineStyleFields({
  params,
  onChange,
  disabled = false,
}: {
  params: { color: string; thickness: number };
  onChange: (next: Record<string, unknown>) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <ColorField label="Color" value={params.color} onChange={(color) => onChange({ color })} disabled={disabled} />
      <NumberField
        label="Thickness"
        value={params.thickness}
        min={0.5}
        max={20}
        onChange={(thickness) => onChange({ thickness })}
        disabled={disabled}
      />
    </div>
  );
}

export function StampPresetPicker({
  presets,
  selectedKey,
  onSelect,
  disabled = false,
}: {
  presets: Record<string, StampPreset>;
  selectedKey: string;
  onSelect: (key: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {Object.entries(presets).map(([key, preset]) => (
        <button
          key={key}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(key)}
          className={[
            "rounded border px-2 py-1.5 text-[11px] font-semibold",
            selectedKey === key ? "border-accent bg-accent-subtle" : "border-border bg-surface hover:bg-surface-muted",
          ].join(" ")}
          style={{ color: preset.color }}
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}
