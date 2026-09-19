import { useRef } from "react";
import { useConversionWorkflow } from "../../conversion/useConversionWorkflow";
import Button from "../ui/Button";
import Dialog from "../ui/Dialog";
import Spinner from "../ui/Spinner";

const ACCEPTED_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * Phase 8 (document conversion) — TO a new PDF from a real `.docx` Word
 * document. Mirrors `CreatePdfFromImagesDialog`'s simplicity: pick a file,
 * upload, then open the resulting document — its `processing` -> `ready`
 * transition is handled by the same existing polling `useOpenDocument`
 * already runs for any upload, since `OfficeToPdfService` reuses
 * `WorkingCopyManager::createDocumentFromFile()` verbatim server-side.
 * Only real `.docx` is supported — see `OfficeToPdfService`'s docblock for
 * why legacy `.doc`/`.xlsx`/`.pptx` are not.
 */
export default function OfficeToPdfDialog() {
  const conv = useConversionWorkflow();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    void conv.uploadOffice(file);
  }

  return (
    <Dialog open={conv.officeDialogOpen} onClose={conv.closeOfficeDialog} title="Create PDF from Word document">
      <div className="flex flex-col gap-4">
        <p className="text-xs text-text-subtle">
          Choose a real .docx Word document to convert into a new PDF. Legacy .doc, .xlsx, and .pptx files are not
          supported.
        </p>
        {conv.officeUploading ? (
          <div className="flex items-center justify-center py-4">
            <Spinner label="Converting…" />
          </div>
        ) : (
          <>
            <Button variant="primary" size="sm" onClick={() => fileInputRef.current?.click()}>
              Choose a Word file…
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_MIME}
              className="sr-only"
              onChange={(e) => handleFile(e.target.files)}
            />
          </>
        )}
        {conv.officeError && <p className="text-xs text-danger">{conv.officeError}</p>}
      </div>
    </Dialog>
  );
}
