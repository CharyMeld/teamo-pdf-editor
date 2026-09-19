import { useContentObjects } from "../../../content-editor/useContentObjects";
import type { ImageObjectParams } from "../../../lib/api";
import IconButton from "../../ui/IconButton";
import Panel from "../../ui/Panel";
import Spinner from "../../ui/Spinner";

/** Real controls for the selected image object — preview, dimensions,
 * rotation, duplicate, delete. Move/resize/rotate themselves happen via
 * ContentObjectLayer's on-canvas handles (dragging commits the same PATCH
 * this panel's buttons use); manipulating a pre-existing image already
 * embedded in the original PDF is out of scope (see ContentObjectService's
 * docblock) — this only ever applies to images this system inserted. */
export default function ImageObjectPanel() {
  const { selectedObject, imagePreviewUrls, deleteSelected, duplicateSelected, busy } = useContentObjects();

  if (!selectedObject || selectedObject.type !== "image") {
    return (
      <Panel title="Image Selection">
        <p className="text-xs text-text-subtle">No image selected.</p>
      </Panel>
    );
  }

  const params = selectedObject.params as ImageObjectParams;
  const preview = imagePreviewUrls[selectedObject.objectId];

  return (
    <Panel title="Image Selection">
      {params.isSignature && (
        <p className="mb-2 rounded bg-warning-subtle px-1.5 py-1 text-[10px] leading-snug text-warning">
          This is a visual signature mark, not a legally verified cryptographic/digital signature.
        </p>
      )}
      <div className="mb-2 flex h-24 items-center justify-center overflow-hidden rounded border border-border bg-surface-muted">
        {preview ? (
          <img src={preview} alt="" className="h-full w-full object-contain" />
        ) : (
          <span className="text-[11px] text-text-subtle">No preview</span>
        )}
      </div>
      <dl className="space-y-1.5 text-xs">
        <div className="flex items-center justify-between">
          <dt className="text-text-muted">File</dt>
          <dd className="truncate text-text-subtle" title={params.originalFilename ?? undefined}>
            {params.originalFilename ?? "—"}
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-text-muted">Size</dt>
          <dd className="text-text-subtle">
            {Math.round(selectedObject.width)} × {Math.round(selectedObject.height)} pt
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-text-muted">Rotation</dt>
          <dd className="text-text-subtle">{Math.round(selectedObject.rotation)}°</dd>
        </div>
      </dl>
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
