<?php

namespace App\Http\Controllers\Api;

use App\Domain\Conversion\Services\OfficeToPdfService;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Phase 8 (document conversion) — TO a new PDF from a real `.docx` Word
 * document. Deliberately independent of any currently-open document, same
 * as Phase 6's `ScanSessionController` — this always creates a brand-new
 * `Document`. See `OfficeToPdfService`'s docblock for why this runs
 * synchronously rather than as a queued job.
 */
class OfficeConversionController extends Controller
{
    public function __construct(private readonly OfficeToPdfService $service) {}

    public function store(Request $request): JsonResponse
    {
        // Phase 14 hardening: previously accepted any file type/size at
        // the validation layer — OfficeToPdfService does its own real
        // content-sniffed check regardless, but this rejects an
        // obviously-wrong upload earlier and consistently with every
        // other upload endpoint's shape.
        $maxKb = (int) config('documents.max_upload_mb', 100) * 1024;
        $request->validate([
            'file' => ['required', 'file', 'mimes:docx', "max:{$maxKb}"],
        ]);

        $document = $this->service->convert($request->file('file'), $request->user());

        return response()->json(['document' => $document->toSummaryArray()], 201);
    }
}
