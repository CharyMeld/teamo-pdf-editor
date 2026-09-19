import { useCompressionWorkflow } from "../../compression/useCompressionWorkflow";
import { formatBytes } from "../../lib/format";
import type { CompressionPreset } from "../../lib/api";
import Button from "../ui/Button";
import Dialog from "../ui/Dialog";

const PRESET_LABEL: Record<CompressionPreset, string> = {
  maxQuality: "Maximum Quality",
  balanced: "Balanced",
  maxCompression: "Maximum Compression",
  custom: "Custom",
};

/**
 * Phase 9 (PDF and file compression): shows the real before-state
 * (filename/original size/page count) up front, runs the real
 * compression as a queued job (no fake "estimated result" — see
 * useCompressionWorkflow's docblock), then shows the real after numbers
 * plus two explicit choices: Download (the default, non-destructive
 * path — the open document is never touched) or Replace original (a
 * normal, undoable pending edit via `working.applyOperationResult`, not
 * an immediate overwrite).
 */
export default function CompressDialog() {
  const c = useCompressionWorkflow();
  const running = c.status === "queued" || c.status === "processing";
  const finished = c.status === "completed" || c.status === "failed";

  return (
    <Dialog open={c.dialogOpen} onClose={c.closeDialog} title="Compress">
      <div className="flex flex-col gap-4">
        {!running && !finished && (
          <>
            <div className="rounded-md border border-border bg-surface-muted p-2 text-xs text-text-muted">
              <div className="flex justify-between">
                <span>File</span>
                <span className="text-text">{c.filename ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span>Original size</span>
                <span className="text-text">{c.originalSizeBytes !== null ? formatBytes(c.originalSizeBytes) : "—"}</span>
              </div>
              <div className="flex justify-between">
                <span>Pages</span>
                <span className="text-text">{c.pageCount}</span>
              </div>
            </div>

            <fieldset className="flex items-center gap-4 text-xs text-text-muted">
              <legend className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-subtle">
                Output
              </legend>
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={c.format === "pdf"} onChange={() => c.setFormat("pdf")} />
                Compressed PDF
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={c.format === "zip"} onChange={() => c.setFormat("zip")} />
                .zip archive
              </label>
            </fieldset>

            {c.format === "pdf" && (
              <>
                <fieldset className="flex flex-col gap-1.5 text-xs text-text-muted">
                  <legend className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-subtle">
                    Preset
                  </legend>
                  {(["maxQuality", "balanced", "maxCompression", "custom"] as CompressionPreset[]).map((p) => (
                    <label key={p} className="flex items-center gap-1.5">
                      <input type="radio" checked={c.preset === p} onChange={() => c.setPreset(p)} />
                      {PRESET_LABEL[p]}
                    </label>
                  ))}
                </fieldset>

                {c.preset === "custom" && (
                  <div className="flex flex-col gap-2 rounded-md border border-border p-2 text-xs text-text-muted">
                    <label className="flex items-center justify-between gap-2">
                      Image DPI
                      <input
                        type="number"
                        min={36}
                        max={600}
                        value={c.custom.imageDpi}
                        onChange={(e) => c.setCustom({ ...c.custom, imageDpi: Number(e.target.value) })}
                        className="w-20 rounded border border-border bg-surface px-1.5 py-1 text-right text-text"
                      />
                    </label>
                    <label className="flex items-center justify-between gap-2">
                      Image quality (1-100)
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={c.custom.imageQuality}
                        onChange={(e) => c.setCustom({ ...c.custom, imageQuality: Number(e.target.value) })}
                        className="w-20 rounded border border-border bg-surface px-1.5 py-1 text-right text-text"
                      />
                    </label>
                    <div className="flex items-center gap-4">
                      <span>Image format</span>
                      <label className="flex items-center gap-1.5">
                        <input
                          type="radio"
                          checked={c.custom.imageFormat === "jpeg"}
                          onChange={() => c.setCustom({ ...c.custom, imageFormat: "jpeg" })}
                        />
                        JPEG
                      </label>
                      <label className="flex items-center gap-1.5">
                        <input
                          type="radio"
                          checked={c.custom.imageFormat === "lossless"}
                          onChange={() => c.setCustom({ ...c.custom, imageFormat: "lossless" })}
                        />
                        Lossless
                      </label>
                    </div>
                    <label className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={c.custom.subsetFonts}
                        onChange={(e) => c.setCustom({ ...c.custom, subsetFonts: e.target.checked })}
                      />
                      Subset &amp; compress fonts
                    </label>
                  </div>
                )}

                <label className="flex items-center gap-1.5 text-xs text-text-muted">
                  <input
                    type="checkbox"
                    checked={c.removeMetadata}
                    onChange={(e) => c.setRemoveMetadata(e.target.checked)}
                  />
                  Remove document metadata (title, author, etc.)
                </label>
                <label className="flex items-center gap-1.5 text-xs text-text-muted">
                  <input
                    type="checkbox"
                    checked={c.cleanupUnusedObjects}
                    onChange={(e) => c.setCleanupUnusedObjects(e.target.checked)}
                  />
                  Clean up unused objects
                </label>
              </>
            )}

            {c.errorMessage && <p className="text-xs text-danger">{c.errorMessage}</p>}

            <Button variant="primary" size="sm" disabled={c.starting} onClick={() => void c.start()}>
              {c.starting ? "Starting…" : "Compress"}
            </Button>
          </>
        )}

        {running && (
          <div className="flex flex-col gap-2">
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${c.progressPercent}%` }}
              />
            </div>
            <p className="text-xs text-text-muted">Compressing… {c.progressPercent}%</p>
          </div>
        )}

        {finished && (
          <div className="flex flex-col gap-2">
            {c.status === "failed" ? (
              <p className="text-xs text-danger">{c.errorMessage ?? "Compression failed."}</p>
            ) : (
              c.result && (
                <div className="rounded-md border border-border bg-surface-muted p-2 text-xs text-text-muted">
                  <div className="flex justify-between">
                    <span>Original size</span>
                    <span className="text-text">{formatBytes(c.result.originalSizeBytes)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>New size</span>
                    <span className="text-text">{formatBytes(c.result.sizeBytes)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Size saved</span>
                    <span className="text-text">
                      {formatBytes(Math.max(0, c.result.originalSizeBytes - c.result.sizeBytes))}
                    </span>
                  </div>
                  {c.result.percentReduction !== null && (
                    <div className="flex justify-between">
                      <span>Reduction</span>
                      <span className="text-text">{c.result.percentReduction}%</span>
                    </div>
                  )}
                </div>
              )
            )}
            {c.errorMessage && c.status !== "failed" && <p className="text-xs text-danger">{c.errorMessage}</p>}
            <div className="flex gap-2">
              {c.downloadUrl && (
                <Button variant="primary" size="sm" onClick={() => window.open(c.downloadUrl!, "_blank")}>
                  Download
                </Button>
              )}
              {c.format === "pdf" && c.status === "completed" && (
                <Button variant="secondary" size="sm" disabled={c.replacing} onClick={() => void c.replace()}>
                  {c.replacing ? "Replacing…" : "Replace original"}
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={c.closeDialog}>
                Close
              </Button>
            </div>
            {c.format === "pdf" && c.status === "completed" && (
              <p className="text-[10px] text-text-subtle">
                "Replace original" applies the compressed version as a normal pending edit — it's undoable and
                doesn't take effect until you Save, just like any other change.
              </p>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}
