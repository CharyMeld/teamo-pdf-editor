import { useAnnotations } from "../../../annotations/useAnnotations";
import { ShapeStyleFields } from "../../../annotations/AnnotationStyleFields";
import type { ShapeAnnotationParams } from "../../../lib/api";
import IconButton from "../../ui/IconButton";
import Panel from "../../ui/Panel";
import Spinner from "../../ui/Spinner";

/** Real, editable controls for a selected rectangle/circle annotation —
 * stroke color/width plus an optional fill, committed immediately via
 * PATCH .../annotations/{id}. */
export default function ShapeAnnotationPanel() {
  const { selectedAnnotation, patchSelected, deleteSelected, duplicateSelected, busy } = useAnnotations();

  if (!selectedAnnotation || !["rectangle", "circle"].includes(selectedAnnotation.type)) {
    return (
      <Panel title="Shape Selection">
        <p className="text-xs text-text-subtle">No shape selected.</p>
      </Panel>
    );
  }

  const params = selectedAnnotation.params as ShapeAnnotationParams;

  return (
    <Panel title={selectedAnnotation.type === "rectangle" ? "Rectangle" : "Circle"}>
      <ShapeStyleFields params={params} onChange={(next) => void patchSelected({ params: next })} disabled={busy} />
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
