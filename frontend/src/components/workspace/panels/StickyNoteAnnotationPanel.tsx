import { useAnnotations } from "../../../annotations/useAnnotations";
import { ColorField } from "../../../annotations/AnnotationStyleFields";
import type { StickyNoteAnnotationParams } from "../../../lib/api";
import IconButton from "../../ui/IconButton";
import Panel from "../../ui/Panel";
import Spinner from "../../ui/Spinner";

/** Real, editable controls for a selected sticky note — the marker color,
 * and the comment text itself. The note's text is intentionally never
 * drawn onto the page (see PdfAnnotationEngine's honest scope boundary):
 * it only ever lives here, in TeamO's own Smart Inspector. */
export default function StickyNoteAnnotationPanel() {
  const { selectedAnnotation, patchSelected, deleteSelected, duplicateSelected, busy } = useAnnotations();

  if (!selectedAnnotation || selectedAnnotation.type !== "sticky_note") {
    return (
      <Panel title="Sticky Note">
        <p className="text-xs text-text-subtle">No sticky note selected.</p>
      </Panel>
    );
  }

  const params = selectedAnnotation.params as StickyNoteAnnotationParams;

  return (
    <Panel title="Sticky Note">
      <p className="mb-2 rounded bg-warning-subtle px-1.5 py-1 text-[10px] leading-snug text-warning">
        This comment is stored in TeamO only — a generic PDF viewer will show the marker but not this text.
      </p>
      <textarea
        rows={3}
        defaultValue={params.note}
        placeholder="Write a comment…"
        onBlur={(e) => {
          if (e.target.value !== params.note) void patchSelected({ params: { note: e.target.value } });
        }}
        className="mb-2 w-full resize-none rounded border border-border bg-bg px-1.5 py-1 text-xs text-text"
      />
      <ColorField label="Marker color" value={params.color} onChange={(color) => void patchSelected({ params: { color } })} disabled={busy} />
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
