<?php

namespace App\Domain\Editing\Services;

use App\Domain\Audit\Services\AuditLogger;
use App\Exceptions\PageOperationException;
use App\Models\Document;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Process;

/**
 * The Editing module's page-management logic (Phase 3 / ORGANIZE): the ten
 * real operations (insert, delete, reorder, duplicate, rotate, extract,
 * split, merge, replace, crop), each translating a validated request into
 * real `PdfPageEngine` calls against the document's current working file
 * (via `WorkingCopyManager`), then committing the result as a new working
 * step (or, for Extract/Split, a brand new sibling `Document`).
 *
 * Every method validates its page references against the REAL current page
 * count before touching qpdf/Ghostscript — see ARCHITECTURE.md's Phase 3
 * section for the full validation contract.
 */
class PageOperationService
{
    public function __construct(
        private readonly PdfPageEngine $engine,
        private readonly WorkingCopyManager $working,
    ) {}

    public function delete(Document $document, User $user, array $pages): array
    {
        $pageCount = $this->working->currentPageCount($document);
        $pages = $this->normalizePages($pages, $pageCount);

        if (count($pages) >= $pageCount) {
            throw PageOperationException::wouldLeaveNoPages();
        }

        $keep = array_values(array_diff(range(1, $pageCount), $pages));

        return $this->runFromCurrentSelection($document, $user, 'delete', ['pages' => $pages], $keep);
    }

    public function reorder(Document $document, User $user, array $newOrder): array
    {
        $pageCount = $this->working->currentPageCount($document);
        $newOrder = array_map('intval', $newOrder);

        $sorted = $newOrder;
        sort($sorted);
        if ($sorted !== range(1, $pageCount)) {
            throw PageOperationException::invalidPermutation();
        }

        return $this->runFromCurrentSelection($document, $user, 'reorder', ['newOrder' => $newOrder], $newOrder);
    }

    public function duplicate(Document $document, User $user, array $pages): array
    {
        $pageCount = $this->working->currentPageCount($document);
        $pages = $this->normalizePages($pages, $pageCount);

        $final = [];
        for ($p = 1; $p <= $pageCount; $p++) {
            $final[] = $p;
            if (in_array($p, $pages, true)) {
                $final[] = $p;
            }
        }

        return $this->runFromCurrentSelection($document, $user, 'duplicate', ['pages' => $pages], $final);
    }

    public function rotate(Document $document, User $user, array $pages, int $degrees): array
    {
        if (! in_array($degrees, [90, 180, 270, -90], true)) {
            throw PageOperationException::invalidRotation($degrees);
        }

        $pageCount = $this->working->currentPageCount($document);
        $pages = $this->normalizePages($pages, $pageCount);

        $identity = range(1, $pageCount);
        $rotations = [];
        foreach ($pages as $p) {
            $rotations[$p] = $degrees;
        }

        return $this->runFromCurrentSelection(
            $document, $user, 'rotate', ['pages' => $pages, 'degrees' => $degrees], $identity, $rotations,
        );
    }

    /** Produces a brand new, independent Document — does NOT mutate $document's working state. */
    public function extract(Document $document, User $user, array $pages): Document
    {
        $pageCount = $this->working->currentPageCount($document);
        $pages = $this->validateOrderedPages($pages, $pageCount);

        $currentPath = $this->working->currentAbsolutePath($document);
        $scratch = $this->working->newScratchDir();

        try {
            $outPath = $scratch.'/result.pdf';
            $this->engine->compose($outPath, [['path' => $currentPath, 'range' => implode(',', $pages)]]);

            $newDocument = $this->working->createDocumentFromFile(
                $user, $outPath, $document->title.' (extracted)', $document->original_filename,
            );

            AuditLogger::record('document.extracted', $document, [
                'newDocumentUuid' => $newDocument->uuid,
                'pages' => $pages,
            ]);

            return $newDocument;
        } finally {
            $this->working->cleanupScratchDir($scratch);
        }
    }

    /**
     * Produces multiple brand new, independent Documents — one per range —
     * does NOT mutate $document's working state.
     *
     * @param  list<array{0: int, 1: int}>  $ranges  1-based, inclusive [start, end] pairs
     * @return list<Document>
     */
    public function split(Document $document, User $user, array $ranges): array
    {
        if ($ranges === []) {
            throw PageOperationException::emptyPageSelection();
        }

        $pageCount = $this->working->currentPageCount($document);
        foreach ($ranges as $range) {
            [$start, $end] = $range;
            if ($start < 1 || $end > $pageCount || $start > $end) {
                throw PageOperationException::invalidPageNumbers([$start, $end], $pageCount);
            }
        }

        $currentPath = $this->working->currentAbsolutePath($document);
        $scratch = $this->working->newScratchDir();
        $newDocuments = [];

        try {
            foreach ($ranges as $index => [$start, $end]) {
                $outPath = $scratch."/split-{$index}.pdf";
                $this->engine->compose($outPath, [['path' => $currentPath, 'range' => "{$start}-{$end}"]]);

                $newDocuments[] = $this->working->createDocumentFromFile(
                    $user, $outPath, "{$document->title} (pages {$start}-{$end})", $document->original_filename,
                );
            }

            AuditLogger::record('document.split', $document, [
                'parts' => count($newDocuments),
                'newDocumentUuids' => array_map(fn (Document $d) => $d->uuid, $newDocuments),
            ]);

            return $newDocuments;
        } finally {
            $this->working->cleanupScratchDir($scratch);
        }
    }

    public function merge(Document $document, User $user, Document $other, string $position): array
    {
        if ($other->user_id !== $user->id || $other->id === $document->id) {
            throw PageOperationException::foreignDocumentMismatch();
        }
        if ($other->status !== 'ready') {
            // 'processing' is deliberately excluded too: page_count/pages()
            // aren't trustworthy until the render pipeline has finished at
            // least once (see DocumentEditController::assertEditable).
            throw PageOperationException::foreignDocumentMismatch();
        }

        $currentPath = $this->working->currentAbsolutePath($document);
        $otherPath = $this->working->currentAbsolutePath($other);

        $sources = $position === 'before'
            ? [['path' => $otherPath, 'range' => '1-z'], ['path' => $currentPath, 'range' => '1-z']]
            : [['path' => $currentPath, 'range' => '1-z'], ['path' => $otherPath, 'range' => '1-z']];

        $scratch = $this->working->newScratchDir();
        try {
            $outPath = $scratch.'/result.pdf';
            $this->engine->compose($outPath, $sources);
            $newPageCount = $this->engine->pageCount($outPath);

            return $this->commit($document, $user, 'merge', [
                'withDocumentUuid' => $other->uuid,
                'position' => $position,
            ], $outPath, $newPageCount);
        } finally {
            $this->working->cleanupScratchDir($scratch);
        }
    }

    public function insert(Document $document, User $user, int $afterPage, string $source, ?UploadedFile $file): array
    {
        $pageCount = $this->working->currentPageCount($document);
        if ($afterPage < 0 || $afterPage > $pageCount) {
            throw PageOperationException::invalidPageNumbers([$afterPage], $pageCount);
        }

        $currentPath = $this->working->currentAbsolutePath($document);
        $scratch = $this->working->newScratchDir();

        try {
            if ($source === 'blank') {
                $referencePage = $afterPage > 0 ? $afterPage : 1;
                [$widthPt, $heightPt] = $this->referencePageSizePt($currentPath, $referencePage, $scratch);
                $insertPath = $scratch.'/blank.pdf';
                $this->engine->blankPage($insertPath, $widthPt, $heightPt);
                $insertRange = '1';
            } elseif ($source === 'upload') {
                if (! $file) {
                    throw PageOperationException::invalidReplacementSource();
                }
                $insertPath = $this->storeUploadedPdfToScratch($file, $scratch);
                $insertRange = '1-z';
            } else {
                throw PageOperationException::processingFailed("unknown insert source '{$source}'.");
            }

            $sources = [];
            if ($afterPage > 0) {
                $sources[] = ['path' => $currentPath, 'range' => "1-{$afterPage}"];
            }
            $sources[] = ['path' => $insertPath, 'range' => $insertRange];
            if ($afterPage < $pageCount) {
                $sources[] = ['path' => $currentPath, 'range' => ($afterPage + 1).'-z'];
            }

            $outPath = $scratch.'/result.pdf';
            $this->engine->compose($outPath, $sources);
            $newPageCount = $this->engine->pageCount($outPath);

            return $this->commit($document, $user, 'insert', [
                'afterPage' => $afterPage,
                'source' => $source,
            ], $outPath, $newPageCount);
        } finally {
            $this->working->cleanupScratchDir($scratch);
        }
    }

    public function replace(Document $document, User $user, int $page, UploadedFile $file, int $replacementPage = 1): array
    {
        $pageCount = $this->working->currentPageCount($document);
        $this->normalizePages([$page], $pageCount);

        $currentPath = $this->working->currentAbsolutePath($document);
        $scratch = $this->working->newScratchDir();

        try {
            $uploadPath = $this->storeUploadedPdfToScratch($file, $scratch);
            $uploadPageCount = $this->engine->pageCount($uploadPath);
            if ($replacementPage < 1 || $replacementPage > $uploadPageCount) {
                throw PageOperationException::invalidReplacementSource();
            }

            $sources = [];
            if ($page > 1) {
                $sources[] = ['path' => $currentPath, 'range' => '1-'.($page - 1)];
            }
            $sources[] = ['path' => $uploadPath, 'range' => (string) $replacementPage];
            if ($page < $pageCount) {
                $sources[] = ['path' => $currentPath, 'range' => ($page + 1).'-z'];
            }

            $outPath = $scratch.'/result.pdf';
            $this->engine->compose($outPath, $sources);
            $newPageCount = $this->engine->pageCount($outPath);

            return $this->commit($document, $user, 'replace', [
                'page' => $page,
                'replacementPage' => $replacementPage,
            ], $outPath, $newPageCount);
        } finally {
            $this->working->cleanupScratchDir($scratch);
        }
    }

    /** @param  array{x: float, y: float, width: float, height: float}  $box  bottom-left-origin PDF points */
    public function crop(Document $document, User $user, array $pages, array $box): array
    {
        $pageCount = $this->working->currentPageCount($document);
        $pages = $this->normalizePages($pages, $pageCount);

        $x = (float) $box['x'];
        $y = (float) $box['y'];
        $width = (float) $box['width'];
        $height = (float) $box['height'];
        if ($width <= 0 || $height <= 0 || $x < 0 || $y < 0) {
            throw PageOperationException::invalidCropBox();
        }

        $currentPath = $this->working->currentAbsolutePath($document);
        $scratch = $this->working->newScratchDir();

        try {
            $sources = [];
            for ($p = 1; $p <= $pageCount; $p++) {
                if (! in_array($p, $pages, true)) {
                    $sources[] = ['path' => $currentPath, 'range' => (string) $p];

                    continue;
                }

                [$pageWidth, $pageHeight] = $this->referencePageSizePt($currentPath, $p, $scratch);
                if ($x + $width > $pageWidth + 0.5 || $y + $height > $pageHeight + 0.5) {
                    throw PageOperationException::invalidCropBox();
                }

                $singlePath = $scratch."/orig-{$p}.pdf";
                $this->engine->compose($singlePath, [['path' => $currentPath, 'range' => (string) $p]]);

                $croppedPath = $scratch."/cropped-{$p}.pdf";
                $this->engine->cropSinglePage($singlePath, $croppedPath, $x, $y, $width, $height);

                $sources[] = ['path' => $croppedPath, 'range' => '1'];
            }

            $outPath = $scratch.'/result.pdf';
            $this->engine->compose($outPath, $sources);
            $newPageCount = $this->engine->pageCount($outPath);

            return $this->commit($document, $user, 'crop', [
                'pages' => $pages,
                'box' => ['x' => $x, 'y' => $y, 'width' => $width, 'height' => $height],
            ], $outPath, $newPageCount);
        } finally {
            $this->working->cleanupScratchDir($scratch);
        }
    }

    /** Shared path for the operations that select a subset/permutation of the CURRENT file's own pages. */
    private function runFromCurrentSelection(
        Document $document,
        User $user,
        string $operationType,
        array $payload,
        array $finalPageNumbers,
        array $rotations = [],
    ): array {
        if ($finalPageNumbers === []) {
            throw PageOperationException::emptyPageSelection();
        }

        $currentPath = $this->working->currentAbsolutePath($document);
        $scratch = $this->working->newScratchDir();

        try {
            $outPath = $scratch.'/result.pdf';
            $range = implode(',', $finalPageNumbers);
            $this->engine->compose($outPath, [['path' => $currentPath, 'range' => $range]], $rotations);
            $newPageCount = $this->engine->pageCount($outPath);

            return $this->commit($document, $user, $operationType, $payload, $outPath, $newPageCount);
        } finally {
            $this->working->cleanupScratchDir($scratch);
        }
    }

    private function commit(Document $document, User $user, string $type, array $payload, string $outPath, int $newPageCount): array
    {
        $result = $this->working->commitStep($document, $user, $type, $payload, $outPath, $newPageCount);
        $step = $result['step'];
        $job = $result['job'];

        return [
            'operationId' => $step->id,
            'sequenceNumber' => $step->sequence_number,
            'pageCount' => $step->page_count_after,
            'thumbnailJobId' => $job->id,
            'status' => 'processing',
            'canUndo' => true,
            'canRedo' => false,
        ];
    }

    /** Validates & de-duplicates a page-number *set* (order doesn't matter — delete/rotate/duplicate/crop). */
    private function normalizePages(array $pages, int $pageCount): array
    {
        if ($pages === []) {
            throw PageOperationException::emptyPageSelection();
        }
        $pages = array_map('intval', $pages);
        $invalid = array_values(array_filter($pages, fn (int $p) => $p < 1 || $p > $pageCount));
        if ($invalid !== []) {
            throw PageOperationException::invalidPageNumbers($invalid, $pageCount);
        }

        return array_values(array_unique($pages));
    }

    /** Validates an *ordered* page list, duplicates allowed — Extract, where order and repeats are meaningful. */
    private function validateOrderedPages(array $pages, int $pageCount): array
    {
        if ($pages === []) {
            throw PageOperationException::emptyPageSelection();
        }
        $pages = array_map('intval', $pages);
        $invalid = array_values(array_filter($pages, fn (int $p) => $p < 1 || $p > $pageCount));
        if ($invalid !== []) {
            throw PageOperationException::invalidPageNumbers($invalid, $pageCount);
        }

        return $pages;
    }

    /** Real page size in PDF points, measured by rasterizing at 72 DPI (1 px == 1 pt at that resolution). */
    private function referencePageSizePt(string $pdfAbsolutePath, int $pageNumber, string $scratchDir): array
    {
        $prefix = $scratchDir.'/refdim-'.$pageNumber;
        $result = Process::timeout(30)->run([
            'pdftoppm', '-png', '-r', '72', '-f', (string) $pageNumber, '-l', (string) $pageNumber,
            $pdfAbsolutePath, $prefix,
        ]);
        $produced = $result->successful() ? glob($prefix.'*.png') : false;
        if (! $produced) {
            throw PageOperationException::processingFailed("could not measure page {$pageNumber}.");
        }

        $dims = @getimagesize($produced[0]);
        if ($dims === false) {
            throw PageOperationException::processingFailed("could not measure page {$pageNumber}.");
        }

        return [(float) $dims[0], (float) $dims[1]];
    }

    /** Validates & copies an uploaded PDF into scratch space for use as an insert/replace source. */
    private function storeUploadedPdfToScratch(UploadedFile $file, string $scratchDir): string
    {
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $realMime = $finfo ? finfo_file($finfo, $file->getRealPath()) : false;
        if ($finfo) {
            finfo_close($finfo);
        }
        if ($realMime !== 'application/pdf') {
            throw PageOperationException::invalidReplacementSource();
        }

        $probe = Process::timeout(30)->run(['pdfinfo', $file->getRealPath()]);
        if (! $probe->successful()) {
            throw PageOperationException::invalidReplacementSource();
        }
        if (preg_match('/^Encrypted:\s+yes/mi', $probe->output())) {
            throw PageOperationException::processingFailed('the source file is password protected and cannot be used here.');
        }

        $dest = $scratchDir.'/source-upload.pdf';
        file_put_contents($dest, file_get_contents($file->getRealPath()));

        return $dest;
    }
}
