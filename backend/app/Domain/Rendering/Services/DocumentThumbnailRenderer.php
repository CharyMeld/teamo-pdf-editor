<?php

namespace App\Domain\Rendering\Services;

use App\Models\Document;
use App\Models\DocumentJob;
use App\Models\DocumentPage;
use App\Models\DocumentVersion;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;
use Throwable;

/**
 * The Rendering module's first real logic (Phase 2): turns a stored PDF
 * version into per-page PNG thumbnails + page geometry (`document_pages`),
 * using `pdftoppm`/`pdfinfo` (poppler-utils, already on the host — see
 * ARCHITECTURE.md's engine table). Used two ways:
 *
 *  - Normal (unencrypted) upload: called from the queued
 *    GenerateDocumentThumbnails job, no password.
 *  - Password-protected upload: called SYNCHRONOUSLY from
 *    DocumentController::unlock() with the just-verified password, so the
 *    password is only ever a local PHP variable on the request's call
 *    stack — it is never written to the `jobs` queue table, the database,
 *    or any log (see ARCHITECTURE.md's Phase 2 "password handling" note).
 *
 * A page's real dimensions are read back from the rendered PNG's own pixel
 * size (converted from the render DPI to PDF points) rather than parsed
 * separately from `pdfinfo`, because `pdftoppm` already applies each
 * page's intrinsic rotation when rasterizing — the PNG's pixel geometry is
 * exactly what the frontend needs to lay out that page correctly.
 * `rotation_degrees` on `document_pages` is reserved for a future *user*
 * rotation edit (Organize phase) and is always 0 here.
 */
class DocumentThumbnailRenderer
{
    public function render(Document $document, DocumentVersion $version, ?string $password, ?DocumentJob $job): void
    {
        $dpi = (int) config('documents.thumbnail_dpi', 110);
        $originalAbsolutePath = Storage::disk($version->storage_disk)->path($version->storage_path);

        $job?->update(['status' => 'processing', 'started_at' => now()]);
        $document->update(['status' => 'processing']);

        $pageCount = $this->readPageCount($originalAbsolutePath, $password);

        $tempRoot = 'thumbnails/'.$document->uuid.'/'.Str::random(8);
        Storage::disk('temp')->makeDirectory($tempRoot);

        DocumentPage::where('document_version_id', $version->id)->delete();

        $succeeded = 0;
        $failedPages = [];

        try {
            for ($page = 1; $page <= $pageCount; $page++) {
                try {
                    [$widthPt, $heightPt, $thumbnailPath] = $this->renderPage(
                        $originalAbsolutePath,
                        $password,
                        $dpi,
                        $tempRoot,
                        $document->uuid,
                        $version->version_number,
                        $page,
                    );

                    DocumentPage::create([
                        'document_version_id' => $version->id,
                        'page_number' => $page,
                        'width_pt' => $widthPt,
                        'height_pt' => $heightPt,
                        'rotation_degrees' => 0,
                        'thumbnail_path' => $thumbnailPath,
                        'created_at' => now(),
                    ]);

                    $succeeded++;
                } catch (Throwable) {
                    $failedPages[] = $page;
                }

                $job?->update(['progress_percent' => (int) floor($page / $pageCount * 100)]);
            }
        } finally {
            Storage::disk('temp')->deleteDirectory($tempRoot);
        }

        if ($succeeded === 0) {
            throw new RuntimeException('No pages could be rendered.');
        }

        $document->update([
            'status' => 'ready',
            'page_count' => $pageCount,
        ]);

        $job?->update([
            'status' => 'completed',
            'progress_percent' => 100,
            'completed_at' => now(),
            'error_message' => $failedPages === [] ? null : ('Pages failed to render: '.implode(',', $failedPages)),
        ]);
    }

    private function readPageCount(string $absolutePath, ?string $password): int
    {
        $args = ['pdfinfo'];
        if (! empty($password)) {
            $args[] = '-upw';
            $args[] = $password;
        }
        $args[] = $absolutePath;

        $result = Process::timeout(30)->run($args);
        if (! $result->successful()) {
            throw new RuntimeException('pdfinfo failed: could not read document.');
        }

        if (preg_match('/^Pages:\s+(\d+)/m', $result->output(), $m) !== 1) {
            throw new RuntimeException('pdfinfo output did not contain a page count.');
        }

        $pages = (int) $m[1];
        if ($pages < 1) {
            throw new RuntimeException('Document reports zero pages.');
        }

        return $pages;
    }

    /** @return array{0: float, 1: float, 2: string} [widthPt, heightPt, storagePath] */
    private function renderPage(
        string $originalAbsolutePath,
        ?string $password,
        int $dpi,
        string $tempRoot,
        string $documentUuid,
        int $versionNumber,
        int $page,
    ): array {
        $pageTempDir = $tempRoot.'/page-'.$page;
        Storage::disk('temp')->makeDirectory($pageTempDir);
        $outPrefix = Storage::disk('temp')->path($pageTempDir).'/out';

        $args = ['pdftoppm', '-png', '-r', (string) $dpi, '-f', (string) $page, '-l', (string) $page];
        if (! empty($password)) {
            $args[] = '-upw';
            $args[] = $password;
        }
        $args[] = $originalAbsolutePath;
        $args[] = $outPrefix;

        $result = Process::timeout(60)->run($args);
        if (! $result->successful()) {
            throw new RuntimeException("pdftoppm failed for page {$page}.");
        }

        $produced = glob($outPrefix.'*.png');
        if ($produced === [] || $produced === false) {
            throw new RuntimeException("pdftoppm produced no output for page {$page}.");
        }

        $pngAbsolutePath = $produced[0];
        $dims = @getimagesize($pngAbsolutePath);
        if ($dims === false) {
            throw new RuntimeException("Could not read rendered image for page {$page}.");
        }

        [$widthPx, $heightPx] = $dims;
        $widthPt = round($widthPx / $dpi * 72, 2);
        $heightPt = round($heightPx / $dpi * 72, 2);

        $storagePath = "{$documentUuid}/versions/{$versionNumber}/thumbnails/{$page}.png";
        Storage::disk('documents')->put($storagePath, file_get_contents($pngAbsolutePath));

        Storage::disk('temp')->deleteDirectory($pageTempDir);

        return [$widthPt, $heightPt, $storagePath];
    }
}
