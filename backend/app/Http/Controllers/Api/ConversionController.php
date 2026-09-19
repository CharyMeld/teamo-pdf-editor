<?php

namespace App\Http\Controllers\Api;

use App\Domain\Conversion\Services\ConversionService;
use App\Domain\Editing\Services\WorkingCopyManager;
use App\Exceptions\ConversionException;
use App\Exceptions\PageOperationException;
use App\Http\Controllers\Controller;
use App\Jobs\RunConversion;
use App\Models\Document;
use App\Models\DocumentJob;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Phase 8 (document conversion) — FROM an existing PDF: PDF -> TXT,
 * PDF -> Images (zip), PDF -> Word. Always a queued job (`RunConversion`),
 * polled exactly like Phase 7's OCR — see ConversionService's docblock for
 * why the result is a standalone downloadable file rather than a
 * working-copy mutation.
 */
class ConversionController extends Controller
{
    public function __construct(
        private readonly ConversionService $conversions,
        private readonly WorkingCopyManager $working,
    ) {}

    public function store(Request $request, Document $document): JsonResponse
    {
        $this->authorizeEditable($request, $document);
        $data = $request->validate([
            'format' => ['required', 'in:txt,images,docx'],
            'pages' => ['sometimes'],
            'imageFormat' => ['sometimes', 'in:png,jpeg'],
        ]);

        $pages = [];
        if ($data['format'] === 'images') {
            $pageCount = $this->working->currentPageCount($document);
            $pages = $this->conversions->normalizePages($this->resolvePages($data['pages'] ?? 'all', $pageCount), $pageCount);
        }

        $job = DocumentJob::create([
            'document_id' => $document->id,
            'job_type' => 'conversion_'.$data['format'],
            'status' => 'queued',
            'payload' => ['format' => $data['format'], 'pages' => $pages],
            'created_by' => $request->user()->id,
        ]);

        RunConversion::dispatch($document->id, $data['format'], $pages, $data['imageFormat'] ?? 'png', $job->id);

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

    public function download(Request $request, Document $document, DocumentJob $job): StreamedResponse
    {
        $this->authorizeOwner($request, $document);
        abort_if($job->document_id !== $document->id, 404);

        if ($job->status !== 'completed' || ! is_array($job->payload) || ! isset($job->payload['outputPath'])) {
            throw ConversionException::outputNotReady();
        }

        $disk = Storage::disk('documents');
        abort_unless($disk->exists($job->payload['outputPath']), 404);

        return $disk->download(
            $job->payload['outputPath'],
            $job->payload['downloadFilename'],
            ['Content-Type' => $job->payload['mimeType']],
        );
    }

    /** @return list<int> */
    private function resolvePages(mixed $pages, int $pageCount): array
    {
        if ($pages === 'all') {
            return range(1, $pageCount);
        }

        if (! is_array($pages) || $pages === []) {
            throw ConversionException::emptyPageSelection();
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
