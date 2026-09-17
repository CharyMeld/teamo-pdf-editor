import { useAnnotations } from "../../../annotations/useAnnotations";
import { MarkStyleFields } from "../../../annotations/AnnotationStyleFields";
import type { MarkAnnotationParams } from "../../../lib/api";
import IconButton from "../../ui/IconButton";
import Panel from "../../ui/Panel";
import Spinner from "../../ui/Spinner";

const TITLES: Record<"highlight" | "underline" | "strikethrough", string> = {
  highlight: "Highlight",
  underline: "Underline",
  strikethrough: "Strikethrough",
};

/** Real, editable controls for a selected highlight/underline/strikethrough
 * annotation — color plus opacity (highlight) or thickness (underline/
 * strikethrough), committed immediately via PATCH .../annotations/{id}. */
export default function MarkupAnnotationPanel() {
  const { selectedAnnotation, patchSelected, deleteSelected, duplicateSelected, busy } = useAnnotations();

  if (!selectedAnnotation || !["highlight", "underline", "strikethrough"].includes(selectedAnnotation.type)) {
    return (
      <Panel title="Markup Selection">
        <p className="text-xs text-text-subtle">No markup annotation selected.</p>
      </Panel>
    );
  }

  const type = selectedAnnotation.type as "highlight" | "underline" | "strikethrough";
  const params = selectedAnnotation.params as MarkAnnotationParams;

  return (
    <Panel title={TITLES[type]}>
      <MarkStyleFields
        type={type}
        params={params}
        onChange={(next) => void patchSelected({ params: next })}
        disabled={busy}
      />
      <div className="mt-3 flex items-center justify-between border-t border-border pt-2">
        <div className="flex items-center gap-1">
          <IconButton icon="duplicate" label="Duplicate" size="sm" disabled={busy} onClick={() => void duplicateSelected()} />
          <IconButton icon="trash" label="Delete" size="sm" disabled={busy} onClick={() => void deleteSelected()} />
        </div>
        {busy && <Spinner size={14} label="Saving…" />}
      </div>
    </Panel>
  );
}
