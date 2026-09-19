import type { TextAlign, TextObjectParams } from "../lib/api";
import IconButton from "../components/ui/IconButton";

export const FONT_OPTIONS: TextObjectParams["font"][] = ["Helvetica", "Times", "Courier", "Pacifico"];

const ALIGN_OPTIONS: { value: TextAlign; icon: "alignLeft" | "alignCenter" | "alignRight"; label: string }[] = [
  { value: "left", icon: "alignLeft", label: "Align left" },
  { value: "center", icon: "alignCenter", label: "Align center" },
  { value: "right", icon: "alignRight", label: "Align right" },
];

interface Props {
  params: TextObjectParams;
  onChange: (next: TextObjectParams | ((prev: TextObjectParams) => TextObjectParams)) => void;
  disabled?: boolean;
}

/** Font / size / bold / italic / color / alignment / line-spacing controls
 * — the real "TEXT" style surface the user asked for, shared between the
 * placement-time composer (TextComposerPopover) and the Smart Inspector's
 * post-creation editing panel (TextObjectPanel) so both stay in sync and
 * neither duplicates this markup. */
export function TextStyleFields({ params, onChange, disabled = false }: Props) {
  // Pacifico is bundled/embedded as a single regular weight only (see
  // PdfContentEngine's docblock) — no bold/italic variant exists to
  // request, so those toggles would silently do nothing server-side.
  const styleTogglesDisabled = disabled || params.font === "Pacifico";
  return (
    <div className="flex flex-col gap-1.5 text-[11px]">
      <div className="flex items-center gap-1.5">
        <select
          aria-label="Font"
          value={params.font}
          disabled={disabled}
          onChange={(e) => onChange((p) => ({ ...p, font: e.target.value as TextObjectParams["font"] }))}
          className="h-6 flex-1 rounded border border-border bg-bg px-1 text-text"
        >
          {FONT_OPTIONS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <input
          aria-label="Font size"
          type="number"
          min={4}
          max={200}
          value={params.fontSize}
          disabled={disabled}
          onChange={(e) => {
            const n = Number.parseFloat(e.target.value);
            if (Number.isFinite(n)) onChange((p) => ({ ...p, fontSize: n }));
          }}
          className="h-6 w-14 rounded border border-border bg-bg px-1 text-text"
        />
      </div>

      <div className="flex items-center gap-1">
        <IconButton
          icon="bold"
          label="Bold"
          size="sm"
          active={params.bold}
          disabled={styleTogglesDisabled}
          onClick={() => onChange((p) => ({ ...p, bold: !p.bold }))}
        />
        <IconButton
          icon="italic"
          label="Italic"
          size="sm"
          active={params.italic}
          disabled={styleTogglesDisabled}
          onClick={() => onChange((p) => ({ ...p, italic: !p.italic }))}
        />
        <span className="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />
        {ALIGN_OPTIONS.map((a) => (
          <IconButton
            key={a.value}
            icon={a.icon}
            label={a.label}
            size="sm"
            active={params.align === a.value}
            disabled={disabled}
            onClick={() => onChange((p) => ({ ...p, align: a.value }))}
          />
        ))}
        <span className="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />
        <label className="flex items-center gap-1">
          <span className="sr-only">Text color</span>
          <input
            type="color"
            value={params.color}
            disabled={disabled}
            onChange={(e) => onChange((p) => ({ ...p, color: e.target.value }))}
            className="h-6 w-6 cursor-pointer rounded border border-border bg-bg p-0.5"
          />
        </label>
      </div>

      <label className="flex items-center justify-between gap-2 text-text-muted">
        Line spacing
        <input
          aria-label="Line spacing"
          type="number"
          min={0.8}
          max={4}
          step={0.1}
          value={params.lineSpacing}
          disabled={disabled}
          onChange={(e) => {
            const n = Number.parseFloat(e.target.value);
            if (Number.isFinite(n)) onChange((p) => ({ ...p, lineSpacing: n }));
          }}
          className="h-6 w-16 rounded border border-border bg-bg px-1 text-text"
        />
      </label>
    </div>
  );
}
