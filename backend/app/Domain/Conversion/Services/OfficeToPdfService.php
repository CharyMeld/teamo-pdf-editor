<?php

namespace App\Domain\Conversion\Services;

use App\Domain\Editing\Services\WorkingCopyManager;
use App\Exceptions\ConversionException;
use App\Models\Document;
use App\Models\User;
use Illuminate\Http\UploadedFile;

/**
 * Phase 8 (document conversion) — TO a new PDF from a real `.docx` Word
 * document. Mirrors Phase 6's `ImagesToPdfService` shape (a brand new
 * `Document`, not a mutation of anything currently open) and, like that
 * service, runs the actual conversion SYNCHRONOUSLY within the request —
 * a real pandoc+wkhtmltopdf run on a single office document was measured
 * at ~1.2s during this phase's own testing, the same "fast enough to not
 * need a queued job" bar Phase 6's FPDF image assembly already cleared.
 * `WorkingCopyManager::createDocumentFromFile()` (reused verbatim, not
 * reimplemented — the exact call `ImagesToPdfService` and Phase 3's
 * Extract/Save-As already share) still dispatches the real, async
 * `GenerateDocumentThumbnails` job afterward, so the resulting document
 * goes through the identical `processing` -> `ready` lifecycle as any
 * normal upload — no new job-polling mechanism needed on the frontend.
 *
 * Only real `.docx` (Office Open XML) is supported — see
 * ConversionEngine's docblock for why: no LibreOffice/`soffice`/`unoconv`
 * exists on this host to reliably read legacy `.doc`, `.xlsx`, or `.pptx`.
 */
class OfficeToPdfService
{
    private const ACCEPTED_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    public function __construct(
        private readonly ConversionEngine $engine,
        private readonly WorkingCopyManager $working,
    ) {}

    public function convert(UploadedFile $file, User $user): Document
    {
        $this->assertRealDocx($file);

        $scratch = $this->working->newScratchDir();
        try {
            $docxPath = $scratch.'/source.docx';
            copy($file->getRealPath(), $docxPath);

            $pdfPath = $scratch.'/output.pdf';
            $this->engine->officeToPdf($docxPath, $pdfPath);

            $title = pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME) ?: 'Converted document';

            return $this->working->createDocumentFromFile($user, $pdfPath, $title, "{$title}.pdf");
        } finally {
            $this->working->cleanupScratchDir($scratch);
        }
    }

    private function assertRealDocx(UploadedFile $file): void
    {
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $realMime = $finfo ? finfo_file($finfo, $file->getRealPath()) : false;
        if ($finfo) {
            finfo_close($finfo);
        }
        if ($realMime !== self::ACCEPTED_MIME_TYPE) {
            throw ConversionException::unsupportedSourceFile();
        }
    }
}
