<?php

namespace App\Jobs;

use App\Domain\Rendering\Services\DocumentThumbnailRenderer;
use App\Models\DocumentEditOperation;
use App\Models\DocumentJob;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Storage;
use Throwable;

/**
 * Phase 3 counterpart to Phase 2's GenerateDocumentThumbnails: regenerates
 * thumbnails for one working-copy step (not a saved version). Always
 * queued, never synchronous — timing during development showed ~0.8s/page
 * at the standard thumbnail DPI, which for a large document (e.g. 261
 * pages) would risk an HTTP timeout if run inline. The frontend polls
 * `document_jobs` for this job exactly like Phase 2's upload flow.
 */
class GenerateWorkingThumbnails implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 900;

    public int $tries = 1;

    public function __construct(
        public readonly int $stepId,
        public readonly int $documentJobId,
    ) {}

    public function handle(DocumentThumbnailRenderer $renderer): void
    {
        $step = DocumentEditOperation::findOrFail($this->stepId);
        $job = DocumentJob::findOrFail($this->documentJobId);

        $sourceAbsolutePath = Storage::disk('documents')->path($step->resulting_storage_path);
        $storagePrefix = "{$step->document->uuid}/working/steps/{$step->sequence_number}/thumbnails";

        try {
            $result = $renderer->renderWorkingStep($sourceAbsolutePath, $step->document->uuid, $storagePrefix, $job);

            $step->update(['pages_snapshot' => $result['pages']]);

            $job->update([
                'status' => 'completed',
                'progress_percent' => 100,
                'completed_at' => now(),
                'error_message' => $result['failedPages'] === []
                    ? null
                    : ('Pages failed to render: '.implode(',', $result['failedPages'])),
            ]);
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
