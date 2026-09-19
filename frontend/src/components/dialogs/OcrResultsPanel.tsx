import { useOpenDocument } from "../../hooks/useOpenDocument";
import { useWorkingDocument } from "../../hooks/useWorkingDocument";
import { useOcrWorkflow } from "../../ocr/useOcrWorkflow";
import Button from "../ui/Button";
import Dialog from "../ui/Dialog";

/**
 * Phase 7 (OCR): "Review OCR Results" — built entirely from data the app
 * already computes (pdf.js's own per-page `getTextContent()`, exposed via
 * `getPageText`), not a second extraction mechanism or backend read. Shows
 * every page's real text (not just the pages this session's OCR run
 * touched), since a document can already have text pages mixed in.
 */
export default function OcrResultsPanel() {
  const ocr = useOcrWorkflow();
  const { getPageText } = useOpenDocument();
  const { pageCount } = useWorkingDocument();

  const pages = Array.from({ length: pageCount }, (_, i) => i + 1);

  function fullText(): string {
    return pages.map((n) => `--- Page ${n} ---\n${getPageText(n) ?? ""}`).join("\n\n");
  }

  async function copyPage(pageNumber: number) {
    await navigator.clipboard.writeText(getPageText(pageNumber) ?? "");
  }

  async function copyAll() {
    await navigator.clipboard.writeText(fullText());
  }

  function downloadAll() {
    const blob = new Blob([fullText()], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement("a");
    a.href = url;
    a.download = "document-text.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog open={ocr.resultsOpen} onClose={ocr.closeResults} title="Review OCR results" size="lg">
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => void copyAll()}>
            Copy all text
          </Button>
          <Button variant="secondary" size="sm" onClick={downloadAll}>
            Download as .txt
          </Button>
        </div>

        <ul className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
          {pages.map((n) => {
            const text = getPageText(n);
            return (
              <li key={n} className="rounded-md border border-border p-2">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-text-subtle">
                    Page {n}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => void copyPage(n)}>
                    Copy
                  </Button>
                </div>
                <p className="max-h-24 overflow-y-auto whitespace-pre-wrap text-xs text-text-muted">
                  {text && text.trim() ? text : "No text on this page."}
                </p>
              </li>
            );
          })}
        </ul>
      </div>
    </Dialog>
  );
}
