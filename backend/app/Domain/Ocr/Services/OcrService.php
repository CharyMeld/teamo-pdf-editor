<?php

namespace App\Domain\Ocr\Services;

use App\Domain\Editing\Services\PdfPageEngine;
use App\Domain\Editing\Services\WorkingCopyManager;
use App\Exceptions\OcrException;
use App\Models\Document;
use App\Models\DocumentJob;
use App\Models\User;

/**
 * Phase 7 (OCR) orchestration: turns a scanned page into real, searchable
 * text by rasterizing it, running Tesseract, and splicing the resulting
 * single-page searchable PDF back into the document's working copy via
 * the exact same qpdf-compose + commitStep mechanism Phase 3's "replace
 * page" already uses (see PdfPageEngine::compose and
 * WorkingCopyManager::commitStep) — one `document_edit_operations` step
 * per OCR'd page, giving OCR real undo/redo for free.
 *
 * A page already containing real text (checked via `OcrEngine::hasExistingText`)
 * is left completely untouched — no rasterization, no step committed —
 * which is what makes mixed scanned/text documents behave correctly.
 *
 * Runs page-by-page rather than batching so `$job->cancel_requested` can
 * be checked between pages: whatever already committed stays committed
 * (nothing wasted), and the frontend sees real incremental progress via
 * `$job->progress_percent`.
 */
class OcrService
{
    public function __construct(
        private readonly OcrEngine $ocr,
        private readonly PdfPageEngine $pdfEngine,
        private readonly WorkingCopyManager $working,
    ) {}

    /**
     * @param  list<int>  $pages  concrete, already-resolved page numbers (the controller expands "all")
     * @return array{pageCount: int, canUndo: bool, canRedo: bool, results: list<array{page: int, status: string, reason?: string}>}
     */
    public function run(Document $document, User $user, array $pages, string $language, DocumentJob $job): array
    {
        $this->ocr->assertLanguageInstalled($language);

        $pageCount = $this->working->currentPageCount($document);
        $pages = $this->normalizePages($pages, $pageCount);

        $job->update(['status' => 'processing', 'started_at' => now()]);

        $results = [];
        $total = count($pages);

        foreach ($pages as $i => $page) {
            $document->refresh();
            $job->refresh();

            if ($job->cancel_requested) {
                $summary = $this->buildSummary($document, $results);
                $job->update([
                    'status' => 'cancelled',
                    'completed_at' => now(),
                    'payload' => $summary,
                ]);

                return $summary;
            }

            $results[] = $this->processPage($document, $user, $page, $language);

            $job->update(['progress_percent' => (int) floor(($i + 1) / $total * 100)]);
        }

        $summary = $this->buildSummary($document, $results);
        $job->update([
            'status' => 'completed',
            'progress_percent' => 100,
            'completed_at' => now(),
            'payload' => $summary,
        ]);

        return $summary;
    }

    /** @return array{page: int, status: string, reason?: string} */
    private function processPage(Document $document, User $user, int $page, string $language): array
    {
        $currentPath = $this->working->currentAbsolutePath($document);

        if ($this->ocr->hasExistingText($currentPath, $page)) {
            return ['page' => $page, 'status' => 'skipped', 'reason' => 'already contains text'];
        }

        $pageCount = $this->working->currentPageCount($document);
        $scratch = $this->working->newScratchDir();

        try {
            $imagePath = $this->ocr->renderPageForOcr($currentPath, $page, $scratch.'/source');
            $recognized = $this->ocr->runTesseract($imagePath, $scratch.'/ocr', $language);

            $sources = [];
            if ($page > 1) {
                $sources[] = ['path' => $currentPath, 'range' => '1-'.($page - 1)];
            }
            $sources[] = ['path' => $recognized['pdfPath'], 'range' => '1'];
            if ($page < $pageCount) {
                $sources[] = ['path' => $currentPath, 'range' => ($page + 1).'-z'];
            }

            $outPath = $scratch.'/result.pdf';
            $this->pdfEngine->compose($outPath, $sources);
            $newPageCount = $this->pdfEngine->pageCount($outPath);

            $this->working->commitStep(
                $document, $user, 'ocr_process', ['page' => $page, 'language' => $language], $outPath, $newPageCount,
            );

            return ['page' => $page, 'status' => 'recognized'];
        } finally {
            $this->working->cleanupScratchDir($scratch);
        }
    }

    /** @param  list<array{page: int, status: string, reason?: string}>  $results */
    private function buildSummary(Document $document, array $results): array
    {
        $document->refresh();

        return [
            'pageCount' => $this->working->currentPageCount($document),
            'canUndo' => $this->working->canUndo($document),
            'canRedo' => $this->working->canRedo($document),
            'results' => $results,
        ];
    }

    /** @return list<int> validated, de-duplicated, ascending */
    private function normalizePages(array $pages, int $pageCount): array
    {
        if ($pages === []) {
            throw OcrException::emptyPageSelection();
        }

        $pages = array_map('intval', $pages);
        $invalid = array_values(array_filter($pages, fn (int $p) => $p < 1 || $p > $pageCount));
        if ($invalid !== []) {
            throw OcrException::invalidPageNumbers($invalid, $pageCount);
        }

        $pages = array_values(array_unique($pages));
        sort($pages);

        return $pages;
    }
}
