<?php

namespace App\Domain\Compression\Services;

use App\Domain\Conversion\Services\ConversionEngine;
use App\Domain\Editing\Services\WorkingCopyManager;
use App\Exceptions\CompressionException;
use App\Models\Document;
use App\Models\DocumentJob;
use App\Models\User;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Phase 9 (PDF and file compression). Mirrors `ConversionService`'s shape
 * (reads the document's CURRENT working state via
 * `WorkingCopyManager::currentAbsolutePath()`, writes the result as a
 * standalone downloadable file under `{uuid}/compressions/{job id}/`) —
 * by default the currently-open document is never touched, satisfying
 * "never overwrite the original unless the user explicitly chooses to
 * replace it" for free. `replace()` is the explicit opt-in: it commits
 * the ALREADY-PRODUCED compressed file into the working copy via
 * `WorkingCopyManager::commitStep()` (reused verbatim — the exact call
 * Phase 7's OCR already uses), which is just this app's normal, undoable
 * pending-edit lifecycle — no new "replace" concept, no re-compression.
 *
 * Every number in the returned payload (`sizeBytes`/`originalSizeBytes`/
 * `percentReduction`) comes from real `filesize()` calls on the actual
 * produced file — there is no separate "estimate" step, since running the
 * real compression as a queued job already keeps the UI responsive
 * without needing to fake a preview number.
 */
class CompressionService
{
    public function __construct(
        private readonly CompressionEngine $engine,
        private readonly ConversionEngine $conversionEngine,
        private readonly WorkingCopyManager $working,
    ) {}

    /** @param  array{imageDpi?: int, imageQuality?: int, imageFormat?: string, subsetFonts?: bool}  $customOptions */
    public function run(
        Document $document,
        string $format,
        string $preset,
        array $customOptions,
        bool $removeMetadata,
        bool $cleanupUnusedObjects,
        DocumentJob $job,
    ): array {
        $job->update(['status' => 'processing', 'started_at' => now()]);

        $sourcePath = $this->working->currentAbsolutePath($document);
        $scratch = $this->working->newScratchDir();

        try {
            $result = $format === 'zip'
                ? $this->runZip($document, $sourcePath, $scratch, $job)
                : $this->runPdf($document, $sourcePath, $scratch, $preset, $customOptions, $removeMetadata, $cleanupUnusedObjects, $job);

            $job->update([
                'status' => 'completed',
                'progress_percent' => 100,
                'completed_at' => now(),
                'payload' => $result,
            ]);

            return $result;
        } finally {
            $this->working->cleanupScratchDir($scratch);
        }
    }

    /** @param  array{imageDpi?: int, imageQuality?: int, imageFormat?: string, subsetFonts?: bool}  $customOptions */
    private function runPdf(
        Document $document,
        string $sourcePath,
        string $scratch,
        string $preset,
        array $customOptions,
        bool $removeMetadata,
        bool $cleanupUnusedObjects,
        DocumentJob $job,
    ): array {
        $originalSizeBytes = filesize($sourcePath);
        $pageCount = $this->working->currentPageCount($document);

        $totalStages = 1 + ($removeMetadata ? 1 : 0) + ($cleanupUnusedObjects ? 1 : 0);
        $completedStages = 0;
        $advance = function () use (&$completedStages, $totalStages, $job) {
            $completedStages++;
            $job->update(['progress_percent' => (int) floor($completedStages / $totalStages * 100)]);
        };

        $current = $scratch.'/stage-compress.pdf';
        if ($preset === 'custom') {
            $this->engine->compressCustom($sourcePath, $current, $customOptions);
        } else {
            $this->engine->compressWithPreset($sourcePath, $current, $preset);
        }
        $advance();

        if ($removeMetadata) {
            $next = $scratch.'/stage-metadata.pdf';
            $this->engine->stripMetadata($current, $next, $scratch);
            $current = $next;
            $advance();
        }

        if ($cleanupUnusedObjects) {
            $next = $scratch.'/stage-cleanup.pdf';
            $this->engine->cleanupUnusedObjects($current, $next);
            $current = $next;
            $advance();
        }

        $newSizeBytes = filesize($current);
        $storagePath = "{$document->uuid}/compressions/{$job->id}/output.pdf";
        Storage::disk('documents')->put($storagePath, file_get_contents($current));

        return [
            'format' => 'pdf',
            'outputPath' => $storagePath,
            'downloadFilename' => (Str::slug($document->title) ?: 'document').'-compressed.pdf',
            'mimeType' => 'application/pdf',
            'sizeBytes' => $newSizeBytes,
            'originalSizeBytes' => $originalSizeBytes,
            'percentReduction' => $originalSizeBytes > 0
                ? round((1 - $newSizeBytes / $originalSizeBytes) * 100, 1)
                : 0.0,
            'pageCount' => $pageCount,
            'preset' => $preset,
        ];
    }

    private function runZip(Document $document, string $sourcePath, string $scratch, DocumentJob $job): array
    {
        $job->update(['progress_percent' => 50]);

        $zipPath = $scratch.'/output.zip';
        $this->conversionEngine->zipFiles([$sourcePath], $zipPath);

        $storagePath = "{$document->uuid}/compressions/{$job->id}/output.zip";
        Storage::disk('documents')->put($storagePath, file_get_contents($zipPath));

        return [
            'format' => 'zip',
            'outputPath' => $storagePath,
            'downloadFilename' => (Str::slug($document->title) ?: 'document').'.zip',
            'mimeType' => 'application/zip',
            'sizeBytes' => filesize($zipPath),
            'originalSizeBytes' => filesize($sourcePath),
            // A zip container around an already-compressed PDF stream
            // barely changes size — reporting a real percentReduction
            // here would be more misleading than informative, so it's
            // left null rather than faked.
            'percentReduction' => null,
            'pageCount' => $this->working->currentPageCount($document),
        ];
    }

    /** @return array{operationId: int, sequenceNumber: int, pageCount: int, thumbnailJobId: int, status: string, canUndo: bool, canRedo: bool} */
    public function replace(Document $document, User $user, DocumentJob $job): array
    {
        if ($job->document_id !== $document->id || $job->status !== 'completed' || ! is_array($job->payload)) {
            throw CompressionException::jobNotCompleted();
        }
        if (($job->payload['format'] ?? null) !== 'pdf') {
            throw CompressionException::unsupportedFormat('only a PDF compression result can replace the working copy.');
        }

        $absolutePath = Storage::disk('documents')->path($job->payload['outputPath']);
        if (! is_file($absolutePath)) {
            throw CompressionException::outputNotReady();
        }

        $commit = $this->working->commitStep(
            $document,
            $user,
            'compress',
            ['preset' => $job->payload['preset'] ?? null],
            $absolutePath,
            $job->payload['pageCount'],
        );

        $step = $commit['step'];
        $thumbnailJob = $commit['job'];

        return [
            'operationId' => $step->id,
            'sequenceNumber' => $step->sequence_number,
            'pageCount' => $step->page_count_after,
            'thumbnailJobId' => $thumbnailJob->id,
            'status' => 'processing',
            'canUndo' => true,
            'canRedo' => false,
        ];
    }
}
