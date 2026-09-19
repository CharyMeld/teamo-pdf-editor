<?php

namespace App\Http\Controllers\Api;

use App\Domain\Editing\Services\WorkingCopyManager;
use App\Domain\Ocr\Services\OcrEngine;
use App\Exceptions\OcrException;
use App\Exceptions\PageOperationException;
use App\Http\Controllers\Controller;
use App\Jobs\RunOcr;
use App\Models\Document;
use App\Models\DocumentJob;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Phase 7 (OCR / recognize text on scanned pages): unlike Phase 3/4/5's
 * synchronous operation endpoints, OCR runs as a queued job (`RunOcr`) —
 * a single page can take real seconds and a whole document could take
 * minutes, so `store()` only enqueues the work and returns a job id; the
 * frontend polls `jobs.show` for progress/result exactly like Phase 2's
 * upload flow already does. See OcrService's docblock for why this is the
 * one operation-family with a real cancel path.
 */
class OcrController extends Controller
{
    public function __construct(
        private readonly OcrEngine $engine,
        private readonly WorkingCopyManager $working,
    ) {}

    public function languages(Request $request, Document $document): JsonResponse
    {
        $this->authorizeOwner($request, $document);

        return response()->json(['data' => $this->engine->installedLanguages()]);
    }

    public function store(Request $request, Document $document): JsonResponse
    {
        $this->authorizeEditable($request, $document);
        $data = $request->validate([
            'pages' => ['required'],
            'language' => ['required', 'string'],
        ]);

        $pages = $this->resolvePages($data['pages'], $document);

        $job = DocumentJob::create([
            'document_id' => $document->id,
            'job_type' => 'ocr_process',
            'status' => 'queued',
            'payload' => ['pages' => $pages, 'language' => $data['language']],
            'created_by' => $request->user()->id,
        ]);

        RunOcr::dispatch($document->id, $request->user()->id, $pages, $data['language'], $job->id);

        return response()->json(['jobId' => $job->id], 202);
    }

    public function show(Request $request, Document $document, DocumentJob $job): JsonResponse
    {
        $this->authorizeOwner($request, $document);
        abort_if($job->document_id !== $document->id, 404);

        return response()->json([
            'status' => $job->status,
            'progressPercent' => $job->progress_percent,
            'errorMessage' => $job->error_message,
            'payload' => $job->payload,
        ]);
    }

    public function cancel(Request $request, Document $document, DocumentJob $job): JsonResponse
    {
        $this->authorizeOwner($request, $document);
        abort_if($job->document_id !== $document->id, 404);

        if (! in_array($job->status, ['queued', 'processing'], true)) {
            throw OcrException::jobNotCancellable();
        }

        $job->update(['cancel_requested' => true]);

        return response()->json(['success' => true]);
    }

    /** @return list<int> */
    private function resolvePages(mixed $pages, Document $document): array
    {
        if ($pages === 'all') {
            return range(1, $this->working->currentPageCount($document));
        }

        if (! is_array($pages) || $pages === []) {
            throw OcrException::emptyPageSelection();
        }

        return array_map('intval', $pages);
    }

    private function authorizeOwner(Request $request, Document $document): void
    {
        abort_if($document->user_id !== $request->user()->id, 403);
    }

    private function authorizeEditable(Request $request, Document $document): void
    {
        $this->authorizeOwner($request, $document);
        if ($document->status !== 'ready') {
            throw PageOperationException::documentNotReady();
        }
    }
}
