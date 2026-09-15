import { SELECTION_TYPES, type SelectionType } from "../../commands/types";
import { useSelectionContext } from "../../commands/useSelectionContext";

const LABELS: Record<(typeof SELECTION_TYPES)[number], string> = {
  none: "No selection",
  page: "Page",
  text: "Text",
  image: "Image",
  annotation: "Annotation",
};

// "page" is real as of Phase 3 — click a thumbnail in the panel on the left
// instead. Simulated here only for the types that still have no real canvas
// interaction to drive them (content/annotation editing arrive in later
// phases).
const SIMULATED_TYPES: SelectionType[] = SELECTION_TYPES.filter((t) => t !== "page");

/**
 * Verification tooling, plainly labeled as such: there is still no real
 * canvas interaction for text/image/annotation content (those arrive in
 * later phases), so this is how the contextual ribbon and Smart Inspector
 * switching is exercised for real for those types. It calls the same
 * useSelectionContext setter a real canvas interaction will call once one
 * exists — this is not a fake feature, it's the honest stand-in for an
 * input source a later phase adds. "Page" selection no longer needs this —
 * it's driven by real thumbnail-panel clicks (see usePageSelection).
 */
export default function DevSelectionSimulator() {
  const { selection, setSelection } = useSelectionContext();

  return (
    <div className="border-b border-dashed border-border-strong bg-surface-muted px-3 py-2">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-subtle">
        Dev: simulate selection
      </p>
      <div className="flex flex-wrap gap-1">
        {SIMULATED_TYPES.map((type) => (
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
