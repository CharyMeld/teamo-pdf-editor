import { usePageSelection } from "../../hooks/usePageSelection";
import { useOcrWorkflow, type OcrScope } from "../../ocr/useOcrWorkflow";
import Button from "../ui/Button";
import Dialog from "../ui/Dialog";

const SCOPE_LABEL: Record<OcrScope, string> = {
  current: "Current page",
  selected: "Selected pages",
  all: "Entire document",
};

/**
 * Phase 7 (OCR): scope + language + progress/cancel, all against the
 * currently-open document's working copy — see useOcrWorkflow's docblock
 * for how a recognized page becomes a real working-copy step. A page that
 * already has real text is reported "already had text", not silently
 * skipped — see OcrService::processPage.
 */
export default function RunOcrDialog() {
  const ocr = useOcrWorkflow();
  const { selectedCount } = usePageSelection();
  const running = ocr.status === "queued" || ocr.status === "processing";
  const finished = ocr.status === "completed" || ocr.status === "cancelled" || ocr.status === "failed";

  return (
    <Dialog open={ocr.dialogOpen} onClose={ocr.closeDialog} title="Run OCR">
      <div className="flex flex-col gap-4">
        {!running && !finished && (
          <>
            <fieldset className="flex flex-col gap-1.5 text-xs text-text-muted">
              <legend className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-subtle">
                Recognize text on
              </legend>
              {(["current", "selected", "all"] as OcrScope[]).map((scope) => (
                <label key={scope} className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    checked={ocr.scope === scope}
                    disabled={scope === "selected" && selectedCount === 0}
                    onChange={() => ocr.setScope(scope)}
                  />
                  {SCOPE_LABEL[scope]}
                  {scope === "selected" && selectedCount > 0 && ` (${selectedCount})`}
                </label>
              ))}
            </fieldset>

            <label className="flex flex-col gap-1 text-xs text-text-muted">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-text-subtle">Language</span>
              <select
                className="rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-text"
                value={ocr.language}
                disabled={ocr.languagesLoading || ocr.languages.length === 0}
                onChange={(e) => ocr.setLanguage(e.target.value)}
              >
                {ocr.languages.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </select>
              {!ocr.languagesLoading && ocr.languages.length <= 1 && (
                <span className="text-[10px] text-text-subtle">
                  Only "{ocr.languages[0] ?? "eng"}" is installed on this server.
                </span>
              )}
            </label>

            {ocr.errorMessage && <p className="text-xs text-danger">{ocr.errorMessage}</p>}

            <Button
              variant="primary"
              size="sm"
              disabled={ocr.starting || ocr.targetPageCount === 0}
              onClick={() => void ocr.start()}
            >
              {ocr.starting ? "Starting…" : `Recognize ${ocr.targetPageCount} page(s)`}
            </Button>
          </>
        )}

        {running && (
          <div className="flex flex-col gap-2">
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${ocr.progressPercent}%` }}
              />
            </div>
            <p className="text-xs text-text-muted">Recognizing text… {ocr.progressPercent}%</p>
            <Button variant="secondary" size="sm" onClick={() => void ocr.cancel()}>
              Cancel
            </Button>
          </div>
        )}

        {finished && (
          <div className="flex flex-col gap-2">
            {ocr.status === "failed" ? (
              <p className="text-xs text-danger">{ocr.errorMessage ?? "OCR failed."}</p>
            ) : (
              <>
                <p className="text-xs text-text">
                  {ocr.status === "cancelled" ? "Cancelled — " : "Done — "}
                  {ocr.summary?.results.length ?? 0} page(s) processed.
                </p>
                <ul className="flex max-h-40 flex-col gap-0.5 overflow-y-auto text-[11px] text-text-muted">
                  {ocr.summary?.results.map((r) => (
                    <li key={r.page}>
                      Page {r.page}: {r.status === "recognized" ? "recognized" : r.reason ?? r.status}
                    </li>
                  ))}
                </ul>
              </>
            )}
            <Button variant="secondary" size="sm" onClick={ocr.closeDialog}>
              Close
            </Button>
          </div>
        )}
      </div>
    </Dialog>
  );
}
