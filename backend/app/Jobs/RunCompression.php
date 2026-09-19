<?php

namespace App\Jobs;

use App\Domain\Compression\Services\CompressionService;
use App\Models\Document;
use App\Models\DocumentJob;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Throwable;

/**
 * Phase 9 (compression). Mirrors `RunConversion`'s shape exactly: scalar
 * constructor args, re-fetch via `findOrFail`, real per-stage progress via
 * `CompressionService`, `tries = 1` (a retried run would just redo
 * idempotent read-only work, but a partially-written output file from a
 * failed attempt is a real footgun not worth risking silently).
 */
class RunCompression implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 900;

    public int $tries = 1;

    /** @param  array{imageDpi?: int, imageQuality?: int, imageFormat?: string, subsetFonts?: bool}  $customOptions */
    public function __construct(
        public readonly int $documentId,
        public readonly string $format,
        public readonly string $preset,
        public readonly array $customOptions,
        public readonly bool $removeMetadata,
        public readonly bool $cleanupUnusedObjects,
        public readonly int $documentJobId,
    ) {}

    public function handle(CompressionService $service): void
    {
        $document = Document::findOrFail($this->documentId);
        $job = DocumentJob::findOrFail($this->documentJobId);

        try {
            $service->run(
                $document,
                $this->format,
                $this->preset,
                $this->customOptions,
                $this->removeMetadata,
                $this->cleanupUnusedObjects,
                $job,
            );
        } catch (Throwable $e) {
            $job->update([
                'status' => 'failed',
                'error_message' => $e->getMessage(),
                'completed_at' => now(),
            ]);
            report($e);
        }
    }
}
