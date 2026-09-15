<?php

namespace App\Jobs;

use App\Domain\Rendering\Services\DocumentThumbnailRenderer;
use App\Models\Document;
use App\Models\DocumentJob;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Throwable;

/**
 * Queued (database driver — see ARCHITECTURE.md's job architecture) page
 * rendering for a normal, unencrypted upload. Password-protected uploads
 * are rendered synchronously from DocumentController::unlock() instead,
 * specifically so a password never has to be serialized into the `jobs`
 * table (see DocumentThumbnailRenderer's docblock).
 */
class GenerateDocumentThumbnails implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 900;

    public int $tries = 1;

    public function __construct(
        public readonly int $documentId,
        public readonly int $documentJobId,
    ) {}

    public function handle(DocumentThumbnailRenderer $renderer): void
    {
        $document = Document::findOrFail($this->documentId);
        $job = DocumentJob::findOrFail($this->documentJobId);
        $version = $document->versions()->where('version_number', 1)->firstOrFail();

        try {
            $renderer->render($document, $version, null, $job);
        } catch (Throwable $e) {
            $document->update(['status' => 'failed']);
            $job->update([
                'status' => 'failed',
                'error_message' => $e->getMessage(),
                'completed_at' => now(),
            ]);
            report($e);
        }
    }
}
