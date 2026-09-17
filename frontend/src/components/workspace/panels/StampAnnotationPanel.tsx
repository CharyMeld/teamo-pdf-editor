import { useAnnotations } from "../../../annotations/useAnnotations";
import { StampPresetPicker } from "../../../annotations/AnnotationStyleFields";
import type { StampAnnotationParams } from "../../../lib/api";
import IconButton from "../../ui/IconButton";
import Panel from "../../ui/Panel";
import Spinner from "../../ui/Spinner";

/** Real controls for a selected stamp — a preset badge picker for the
 * "preset" variant, or a preview/filename for the real inserted-image
 * variant (mirrors Phase 4's ImageObjectPanel — image stamps are only
 * ever movable/resizable/deletable objects this system itself placed,
 * same scope boundary as Phase 4's inserted images). */
export default function StampAnnotationPanel() {
  const { selectedAnnotation, imagePreviewUrls, stampPresets, patchSelected, deleteSelected, duplicateSelected, busy } = useAnnotations();

  if (!selectedAnnotation || selectedAnnotation.type !== "stamp") {
    return (
      <Panel title="Stamp Selection">
        <p className="text-xs text-text-subtle">No stamp selected.</p>
      </Panel>
    );
  }

  const params = selectedAnnotation.params as StampAnnotationParams;

  return (
    <Panel title="Stamp">
      {params.stampKind === "image" ? (
        <div className="mb-2 flex h-24 items-center justify-center overflow-hidden rounded border border-border bg-surface-muted">
          {imagePreviewUrls[selectedAnnotation.annotationId] ? (
            <img src={imagePreviewUrls[selectedAnnotation.annotationId]} alt="" className="h-full w-full object-contain" />
          ) : (
            <span className="text-[11px] text-text-subtle">{params.originalFilename ?? "No preview"}</span>
          )}
        </div>
      ) : (
        <StampPresetPicker
          presets={stampPresets}
          selectedKey={params.presetKey ?? "approved"}
          onSelect={(presetKey) => void patchSelected({ params: { presetKey } })}
          disabled={busy}
        />
      )}
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
