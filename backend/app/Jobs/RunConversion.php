<?php

namespace App\Jobs;

use App\Domain\Conversion\Services\ConversionService;
use App\Models\Document;
use App\Models\DocumentJob;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Throwable;

/**
 * Phase 8 (document conversion) — FROM an existing PDF (.txt/.zip-of-
 * images/.docx). Mirrors `RunOcr`'s shape exactly: scalar constructor
 * args, re-fetch via `findOrFail`, real per-page/per-stage progress via
 * `ConversionService`, `tries = 1` (a retried conversion would just redo
 * the same idempotent read-only work, but a partially-written output file
 * from a failed attempt is a real footgun not worth risking silently).
 */
class RunConversion implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 900;

    public int $tries = 1;

    /** @param  list<int>  $pages */
    public function __construct(
        public readonly int $documentId,
        public readonly string $format,
        public readonly array $pages,
        public readonly string $imageFormat,
        public readonly int $documentJobId,
    ) {}

    public function handle(ConversionService $service): void
    {
        $document = Document::findOrFail($this->documentId);
        $job = DocumentJob::findOrFail($this->documentJobId);

        try {
            $service->run($document, $this->format, $this->pages, $this->imageFormat, $job);
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
