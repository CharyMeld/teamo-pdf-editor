<?php

namespace App\Http\Controllers\Api;

use App\Domain\Compression\Services\CompressionService;
use App\Exceptions\CompressionException;
use App\Exceptions\PageOperationException;
use App\Http\Controllers\Controller;
use App\Jobs\RunCompression;
use App\Models\Document;
use App\Models\DocumentJob;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Phase 9 (PDF and file compression): real compression against a
 * document's current working state — see CompressionService's docblock
 * for why the default result is a standalone downloadable file, and
 * `replace()` for the explicit opt-in that commits it into the working
 * copy instead. Runs as a queued job (`RunCompression`), polled exactly
 * like Phase 8's conversions.
 */
class CompressionController extends Controller
{
    public function __construct(private readonly CompressionService $compression) {}

    public function store(Request $request, Document $document): JsonResponse
    {
        $this->authorizeEditable($request, $document);
        $data = $request->validate([
            'format' => ['required', 'in:pdf,zip'],
            'preset' => ['required_if:format,pdf', 'in:maxQuality,balanced,maxCompression,custom'],
            'custom' => ['sometimes', 'array'],
            'custom.imageDpi' => ['sometimes', 'integer', 'min:36', 'max:600'],
            'custom.imageQuality' => ['sometimes', 'integer', 'min:1', 'max:100'],
            'custom.imageFormat' => ['sometimes', 'in:jpeg,lossless'],
            'custom.subsetFonts' => ['sometimes', 'boolean'],
            'removeMetadata' => ['sometimes', 'boolean'],
            'cleanupUnusedObjects' => ['sometimes', 'boolean'],
        ]);

        $job = DocumentJob::create([
            'document_id' => $document->id,
            'job_type' => 'compression_'.$data['format'],
            'status' => 'queued',
            'payload' => ['format' => $data['format'], 'preset' => $data['preset'] ?? null],
            'created_by' => $request->user()->id,
        ]);

        RunCompression::dispatch(
            $document->id,
            $data['format'],
            $data['preset'] ?? 'balanced',
            $data['custom'] ?? [],
            $data['removeMetadata'] ?? false,
            $data['cleanupUnusedObjects'] ?? true,
            $job->id,
        );

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
            throw CompressionException::outputNotReady();
        }

        $disk = Storage::disk('documents');
        abort_unless($disk->exists($job->payload['outputPath']), 404);

        return $disk->download(
            $job->payload['outputPath'],
            $job->payload['downloadFilename'],
            ['Content-Type' => $job->payload['mimeType']],
        );
    }

    public function replace(Request $request, Document $document, DocumentJob $job): JsonResponse
    {
        $this->authorizeEditable($request, $document);
        abort_if($job->document_id !== $document->id, 404);

        return response()->json($this->compression->replace($document, $request->user(), $job));
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
