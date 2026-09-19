<?php

namespace App\Jobs;

use App\Domain\Ocr\Services\OcrService;
use App\Models\Document;
use App\Models\DocumentJob;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Throwable;

/**
 * Phase 7 (OCR): mirrors GenerateWorkingThumbnails' shape exactly — a
 * potentially long-running, real per-page pipeline (rasterize + Tesseract
 * + qpdf splice, once per target page) that must never block the HTTP
 * request. `tries = 1`: OcrService commits one working-copy step per
 * recognized page as it goes, so a queue-level retry of a partially
 * completed run would silently redo already-committed pages rather than
 * cleanly resuming — a failure is surfaced to the user instead.
 */
class RunOcr implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 1800;

    public int $tries = 1;

    /** @param  list<int>  $pages */
    public function __construct(
        public readonly int $documentId,
        public readonly int $userId,
        public readonly array $pages,
        public readonly string $language,
        public readonly int $documentJobId,
    ) {}

    public function handle(OcrService $service): void
    {
        $document = Document::findOrFail($this->documentId);
        $user = User::findOrFail($this->userId);
        $job = DocumentJob::findOrFail($this->documentJobId);

        try {
            $service->run($document, $user, $this->pages, $this->language, $job);
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
