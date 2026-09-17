import { useRef, useState } from "react";
import { useOpenDocument } from "../../hooks/useOpenDocument";
import { useScanWorkflow } from "../../scanning/useScanWorkflow";
import ScanImageEditorPanel from "../../scanning/ScanImageEditorPanel";
import type { ScanSessionImage } from "../../lib/api";
import Button from "../ui/Button";
import Dialog from "../ui/Dialog";
import Icon from "../ui/Icon";
import IconButton from "../ui/IconButton";
import Spinner from "../ui/Spinner";

const ACCEPTED_MIME = "image/jpeg,image/png,image/tiff";

/**
 * Phase 6's real scanning/image-import workflow: SCAN/IMPORT -> REVIEW ->
 * CLEAN -> REORDER -> CREATE PDF, combined pragmatically into one cohesive
 * screen (an import dropzone, a draggable thumbnail strip doubling as
 * REVIEW+REORDER, and a per-selected-image CLEAN editor) rather than five
 * rigid wizard pages — see ARCHITECTURE.md's Phase 6 (frontend) section
 * for why. Deliberately independent of any currently-open document
 * (`useScanWorkflow`, not `useWorkingDocument`) — this always produces a
 * brand-new one. "Save" is implicit: the created document's version 1 IS
 * the saved result, exactly like any fresh upload.
 */
export default function CreatePdfFromImagesDialog() {
  const workflow = useScanWorkflow();
  const { openExisting } = useOpenDocument();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [title, setTitle] = useState("Scanned document");
  const [creating, setCreating] = useState(false);
  const [dragImageId, setDragImageId] = useState<number | null>(null);

  const selected = workflow.images.find((i) => i.id === workflow.selectedImageId) ?? null;

  function handleFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    if (files.length > 0) void workflow.addFiles(files);
  }

  async function handleCreatePdf() {
    setCreating(true);
    try {
      const document = await workflow.createPdf(title.trim() || "Scanned document");
      await openExisting(document.id);
      workflow.closeDialog();
    } catch {
      // workflow.error already recorded a message; dialog stays open so the user can retry.
    } finally {
      setCreating(false);
    }
  }

  function handleDropTarget(targetId: number) {
    if (dragImageId === null || dragImageId === targetId) {
      setDragImageId(null);
      return;
    }
    const ids = workflow.images.map((i) => i.id);
    const without = ids.filter((id) => id !== dragImageId);
    const targetIndex = without.indexOf(targetId);
    without.splice(targetIndex, 0, dragImageId);
    setDragImageId(null);
    void workflow.reorder(without);
  }

  const nonExcludedCount = workflow.images.filter((i) => !i.params.excluded).length;

  return (
    <Dialog open={workflow.dialogOpen} onClose={workflow.closeDialog} title="Create PDF from Images" size="lg">
      <div className="flex flex-col gap-3">
        {workflow.error && (
          <p role="alert" className="rounded bg-danger-subtle px-2 py-1.5 text-xs text-danger">
            {workflow.error}
          </p>
        )}

        {/* IMPORT */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
          className={[
            "flex flex-col items-center gap-1.5 rounded-md border-2 border-dashed px-4 py-3 text-center",
            dragOver ? "border-accent bg-accent-subtle/30" : "border-border",
          ].join(" ")}
        >
          <p className="text-xs text-text-muted">Drag JPG, PNG, or TIFF images here, or</p>
          <Button size="sm" variant="primary" onClick={() => fileInputRef.current?.click()}>
            Choose images
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_MIME}
            multiple
            className="sr-only"
            onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
          />
        </div>

        {workflow.loading ? (
          <div className="flex items-center justify-center py-6">
            <Spinner label="Starting scan session…" />
          </div>
        ) : (
          <div className="flex gap-4">
            {/* REVIEW + REORDER: a draggable thumbnail strip. */}
            <div className="flex w-40 shrink-0 flex-col gap-2 overflow-y-auto" style={{ maxHeight: 460 }}>
              {workflow.images.length === 0 && (
                <p className="px-1 text-xs text-text-subtle">No images added yet.</p>
              )}
              {workflow.images.map((image) => (
                <ScanThumbnail
                  key={image.id}
                  image={image}
                  src={workflow.previewUrl(image.id)}
                  isSelected={workflow.selectedImageId === image.id}
                  onSelect={() => workflow.selectImage(image.id)}
                  onRemove={() => void workflow.removeImage(image.id)}
                  onDragStart={() => setDragImageId(image.id)}
                  onDropOn={() => handleDropTarget(image.id)}
                  disabled={workflow.busy}
                />
              ))}
            </div>

            {/* CLEAN: the selected image's real adjustment controls. */}
            <div className="flex-1 border-l border-border pl-4">
              {selected ? (
                <ScanImageEditorPanel
                  image={selected}
                  previewSrc={workflow.previewUrl(selected.id)}
                  busy={workflow.busy}
                  onChange={(patch) => void workflow.updateSelected(patch)}
                />
              ) : (
                <p className="flex h-full items-center justify-center text-xs text-text-subtle">
                  Select an image on the left to clean it up.
                </p>
              )}
            </div>
          </div>
        )}

        {/* CREATE PDF */}
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <label className="flex flex-1 items-center gap-2 text-xs text-text-muted">
            Title
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-7 flex-1 rounded border border-border bg-bg px-2 text-text"
            />
          </label>
          {creating ? (
            <Spinner label="Creating PDF…" />
          ) : (
            <Button variant="primary" disabled={nonExcludedCount === 0} onClick={() => void handleCreatePdf()}>
              Create PDF ({nonExcludedCount} page{nonExcludedCount === 1 ? "" : "s"})
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function ScanThumbnail({
  image,
  src,
  isSelected,
  onSelect,
  onRemove,
  onDragStart,
  onDropOn,
  disabled,
}: {
  image: ScanSessionImage;
  src: string | undefined;
  isSelected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDropOn: () => void;
  disabled: boolean;
}) {
  return (
    <div
      draggable={!disabled}
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDropOn}
      onClick={onSelect}
      className={[
        "relative cursor-pointer rounded border-2 p-1",
        isSelected ? "border-accent" : "border-transparent hover:border-border-strong",
        image.params.excluded ? "opacity-40" : "",
      ].join(" ")}
    >
      <div className="flex aspect-[3/4] items-center justify-center overflow-hidden rounded bg-surface-muted">
        {src ? <img src={src} alt="" className="h-full w-full object-contain" /> : <Icon name="image" size={20} />}
      </div>
      {image.blankPageDetected && !image.params.excluded && (
        <span className="absolute left-1 top-1 rounded bg-warning-subtle px-1 text-[9px] font-semibold text-warning">
          Blank?
        </span>
      )}
      <div className="absolute right-1 top-1">
        <IconButton icon="trash" label="Remove image" size="sm" onClick={(e) => { e.stopPropagation(); onRemove(); }} />
      </div>
    </div>
  );
}
