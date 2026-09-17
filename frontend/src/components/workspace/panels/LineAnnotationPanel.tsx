import { useAnnotations } from "../../../annotations/useAnnotations";
import { LineStyleFields } from "../../../annotations/AnnotationStyleFields";
import type { ArrowAnnotationParams, FreehandAnnotationParams } from "../../../lib/api";
import IconButton from "../../ui/IconButton";
import Panel from "../../ui/Panel";
import Spinner from "../../ui/Spinner";

/** Real, editable controls for a selected freehand stroke or arrow — both
 * share the same color+thickness shape. Freehand supports move+rotate on
 * the canvas only (no resize handles — rescaling every stored point is an
 * honest scope limit, see AnnotationLayer); arrow is repositioned by
 * dragging its own two endpoint handles instead of a generic box. */
export default function LineAnnotationPanel() {
  const { selectedAnnotation, patchSelected, deleteSelected, duplicateSelected, busy } = useAnnotations();

  if (!selectedAnnotation || !["freehand", "arrow"].includes(selectedAnnotation.type)) {
    return (
      <Panel title="Line Selection">
        <p className="text-xs text-text-subtle">No freehand stroke or arrow selected.</p>
      </Panel>
    );
  }

  const params = selectedAnnotation.params as FreehandAnnotationParams | ArrowAnnotationParams;

  return (
    <Panel title={selectedAnnotation.type === "freehand" ? "Freehand Drawing" : "Arrow"}>
      <LineStyleFields params={params} onChange={(next) => void patchSelected({ params: next })} disabled={busy} />
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
