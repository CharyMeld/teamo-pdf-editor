import { usePageSelection } from "../../hooks/usePageSelection";
import { useConversionWorkflow, type ConversionScope } from "../../conversion/useConversionWorkflow";
import Button from "../ui/Button";
import Dialog from "../ui/Dialog";

const SCOPE_LABEL: Record<ConversionScope, string> = {
  current: "Current page",
  selected: "Selected pages",
  all: "Entire document",
};

const TITLE: Record<string, string> = {
  txt: "Convert to Text",
  images: "Convert to Images",
  docx: "Convert to Word",
};

/**
 * Phase 8 (document conversion) — FROM an existing PDF: one dialog shared
 * by all three export commands, parameterized by
 * `useConversionWorkflow.format`. Unlike Phase 7's OCR result, completion
 * hands back a real download URL rather than mutating the working copy —
 * see useConversionWorkflow's docblock.
 */
export default function ExportDialog() {
  const conv = useConversionWorkflow();
  const { selectedCount } = usePageSelection();
  const running = conv.status === "queued" || conv.status === "processing";
  const finished = conv.status === "completed" || conv.status === "failed";
  const format = conv.format;

  if (!format) return null;

  return (
    <Dialog open={conv.dialogOpen} onClose={conv.closeDialog} title={TITLE[format]}>
      <div className="flex flex-col gap-4">
        {!running && !finished && (
          <>
            {format === "docx" && (
              <p className="text-xs text-text-subtle">
                This produces real, extractable paragraph text — it is a text-content conversion, not a
                pixel-perfect copy of the original layout (tables, columns, and images are not reconstructed).
              </p>
            )}

            {format === "images" && (
              <>
                <fieldset className="flex flex-col gap-1.5 text-xs text-text-muted">
                  <legend className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-subtle">
                    Export
                  </legend>
                  {(["current", "selected", "all"] as ConversionScope[]).map((scope) => (
                    <label key={scope} className="flex items-center gap-1.5">
                      <input
                        type="radio"
                        checked={conv.scope === scope}
                        disabled={scope === "selected" && selectedCount === 0}
                        onChange={() => conv.setScope(scope)}
                      />
                      {SCOPE_LABEL[scope]}
                      {scope === "selected" && selectedCount > 0 && ` (${selectedCount})`}
                    </label>
                  ))}
                </fieldset>

                <fieldset className="flex items-center gap-4 text-xs text-text-muted">
                  <legend className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-subtle">
                    Image format
                  </legend>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      checked={conv.imageFormat === "png"}
                      onChange={() => conv.setImageFormat("png")}
                    />
                    PNG
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      checked={conv.imageFormat === "jpeg"}
                      onChange={() => conv.setImageFormat("jpeg")}
                    />
                    JPEG
                  </label>
                </fieldset>
              </>
            )}

            {conv.errorMessage && <p className="text-xs text-danger">{conv.errorMessage}</p>}

            <Button
              variant="primary"
              size="sm"
              disabled={conv.starting || (format === "images" && conv.targetPageCount === 0)}
              onClick={() => void conv.start()}
            >
              {conv.starting
                ? "Starting…"
                : format === "images"
                  ? `Convert ${conv.targetPageCount} page(s)`
                  : "Convert"}
            </Button>
          </>
        )}

        {running && (
          <div className="flex flex-col gap-2">
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${conv.progressPercent}%` }}
              />
            </div>
            <p className="text-xs text-text-muted">Converting… {conv.progressPercent}%</p>
          </div>
        )}

        {finished && (
          <div className="flex flex-col gap-2">
            {conv.status === "failed" ? (
              <p className="text-xs text-danger">{conv.errorMessage ?? "Conversion failed."}</p>
            ) : (
              <p className="text-xs text-text">Done — your file is ready.</p>
            )}
            <div className="flex gap-2">
              {conv.downloadUrl && (
                <Button variant="primary" size="sm" onClick={() => window.open(conv.downloadUrl!, "_blank")}>
                  Download
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={conv.closeDialog}>
                Close
              </Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
