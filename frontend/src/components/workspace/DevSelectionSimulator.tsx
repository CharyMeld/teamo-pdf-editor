import { SELECTION_TYPES } from "../../commands/types";
import { useSelectionContext } from "../../commands/useSelectionContext";

const LABELS: Record<(typeof SELECTION_TYPES)[number], string> = {
  none: "No selection",
  page: "Page",
  text: "Text",
  image: "Image",
  annotation: "Annotation",
};

/**
 * Phase 1 verification tooling, plainly labeled as such: there is no real
 * PDF canvas yet to select page/text/image/annotation content from, so
 * this is how the contextual ribbon and Smart Inspector switching is
 * exercised for real. It calls the same useSelectionContext setter a real
 * canvas interaction will call once one exists — this is not a fake
 * feature, it's the honest stand-in for an input source Phase 2 adds.
 */
export default function DevSelectionSimulator() {
  const { selection, setSelection } = useSelectionContext();

  return (
    <div className="border-b border-dashed border-border-strong bg-surface-muted px-3 py-2">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-subtle">
        Dev: simulate selection
      </p>
      <div className="flex flex-wrap gap-1">
        {SELECTION_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setSelection(type)}
            aria-pressed={selection === type}
            className={[
              "rounded px-2 py-1 text-[11px]",
              selection === type
                ? "bg-accent text-on-accent"
                : "bg-surface text-text-muted hover:text-text border border-border",
            ].join(" ")}
          >
            {LABELS[type]}
          </button>
        ))}
      </div>
    </div>
  );
}
