<?php

namespace App\Domain\Scanning\Services;

use App\Domain\Editing\Services\WorkingCopyManager;
use App\Exceptions\ScanException;
use App\Models\ScanSession;
use App\Models\User;
use FPDF;
use Illuminate\Support\Facades\Storage;

/**
 * Phase 6's CREATE PDF step: renders every non-excluded image in a scan
 * session through its current cleanup params (`ScanImageProcessor`),
 * composes them into one brand-new PDF (plain FPDF — no FPDI needed,
 * there's no existing PDF being imported into, unlike Phase 4/5's
 * engines), then hands the finished file to
 * `WorkingCopyManager::createDocumentFromFile()` — the exact same real
 * ingest path Save As/Extract/Split already use, so the resulting
 * `Document` goes through genuine page-count/thumbnail/ready-status
 * processing, not a shortcut.
 */
class ImagesToPdfService
{
    /** Assumed source resolution for converting each processed image's real pixel dimensions to PDF points — typical flatbed/document-scanner output. */
    private const ASSUMED_DPI = 150;

    public function __construct(
        private readonly ScanImageProcessor $processor,
        private readonly WorkingCopyManager $working,
    ) {}

    public function createDocument(ScanSession $session, User $user, string $title): mixed
    {
        $images = $session->images()->get()->reject(fn ($image) => (bool) ($image->params['excluded'] ?? false));
        if ($images->isEmpty()) {
            throw ScanException::noImages();
        }

        $scratch = $this->working->newScratchDir();
        try {
            $pdf = new FPDF('P', 'pt');
            $pdf->SetAutoPageBreak(false);
            $pdf->SetMargins(0, 0, 0);

            foreach ($images->values() as $index => $image) {
                $absoluteSource = Storage::disk('documents')->path($image->original_storage_path);
                $processedPath = "{$scratch}/page-{$index}.png";
                $this->processor->process($absoluteSource, $image->params, $processedPath);

                [$widthPx, $heightPx] = getimagesize($processedPath);
                $widthPt = $widthPx / self::ASSUMED_DPI * 72;
                $heightPt = $heightPx / self::ASSUMED_DPI * 72;

                $pdf->AddPage($widthPt > $heightPt ? 'L' : 'P', [$widthPt, $heightPt]);
                $pdf->Image($processedPath, 0, 0, $widthPt, $heightPt, 'PNG');
            }

            $outputPath = "{$scratch}/combined.pdf";
            $pdf->Output('F', $outputPath);

            $document = $this->working->createDocumentFromFile($user, $outputPath, $title, 'scanned-document.pdf');

            $session->update(['status' => 'completed', 'created_document_id' => $document->id]);

            return $document;
        } finally {
            $this->working->cleanupScratchDir($scratch);
        }
    }
}
