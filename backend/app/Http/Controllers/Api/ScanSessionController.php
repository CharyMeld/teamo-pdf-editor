<?php

namespace App\Http\Controllers\Api;

use App\Domain\Scanning\Services\ImagesToPdfService;
use App\Domain\Scanning\Services\ScanSessionService;
use App\Exceptions\ScanException;
use App\Http\Controllers\Controller;
use App\Models\ScanSession;
use App\Models\ScanSessionImage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * Phase 6 (scanning/image-import — SCAN/IMPORT → REVIEW → CLEAN →
 * REORDER → CREATE PDF): every endpoint here operates on a `ScanSession`,
 * which exists independently of any `Document` until `createPdf()` calls
 * `ImagesToPdfService` — see that class's and `ScanSessionService`'s
 * docblocks for the full non-destructive design.
 */
class ScanSessionController extends Controller
{
    public function __construct(
        private readonly ScanSessionService $sessions,
        private readonly ImagesToPdfService $imagesToPdf,
    ) {}

    public function store(Request $request): JsonResponse
    {
        $session = $this->sessions->createSession($request->user());

        return response()->json(['id' => $session->uuid], 201);
    }

    public function show(Request $request, ScanSession $session): JsonResponse
    {
        $this->authorizeOwner($request, $session);

        return response()->json(['data' => $session->images->map(fn (ScanSessionImage $i) => $this->serializeImage($i))]);
    }

    public function addImages(Request $request, ScanSession $session): JsonResponse
    {
        $this->authorizeOwner($request, $session);
        // Phase 14 hardening: previously no app-level size limit here at
        // all, just PHP's ini backstop.
        $maxKb = (int) config('documents.max_image_upload_mb', 20) * 1024;
        $request->validate([
            'images' => ['required', 'array', 'min:1'],
            'images.*' => ['required', 'file', "max:{$maxKb}"],
        ]);

        $created = $this->sessions->addImages($session, $request->file('images'));

        return response()->json([
            'data' => array_map(fn (ScanSessionImage $i) => $this->serializeImage($i), $created),
        ], 201);
    }

    public function updateImage(Request $request, ScanSession $session, int $imageId): JsonResponse
    {
        $this->authorizeOwner($request, $session);
        $image = $this->findImage($session, $imageId);

        $data = $request->validate([
            'rotationDegrees' => ['sometimes', 'integer'],
            'deskew' => ['sometimes', 'boolean'],
            'crop' => ['sometimes', 'nullable', 'array'],
            'crop.x' => ['required_with:crop', 'numeric'],
            'crop.y' => ['required_with:crop', 'numeric'],
            'crop.width' => ['required_with:crop', 'numeric', 'gt:0'],
            'crop.height' => ['required_with:crop', 'numeric', 'gt:0'],
            'brightness' => ['sometimes', 'numeric'],
            'contrast' => ['sometimes', 'numeric'],
            'sharpen' => ['sometimes', 'numeric'],
            'noiseReduction' => ['sometimes', 'numeric'],
            'backgroundCleanup' => ['sometimes', 'boolean'],
            'excluded' => ['sometimes', 'boolean'],
        ]);

        $updated = $this->sessions->updateImageParams($image, $data);

        return response()->json(['data' => $this->serializeImage($updated)]);
    }

    public function reorder(Request $request, ScanSession $session): JsonResponse
    {
        $this->authorizeOwner($request, $session);
        $data = $request->validate([
            'imageIds' => ['required', 'array', 'min:1'],
            'imageIds.*' => ['required', 'integer'],
        ]);

        $this->sessions->reorderImages($session, $data['imageIds']);

        return response()->json(['data' => $session->fresh()->images->map(fn (ScanSessionImage $i) => $this->serializeImage($i))]);
    }

    public function destroyImage(Request $request, ScanSession $session, int $imageId): JsonResponse
    {
        $this->authorizeOwner($request, $session);
        $image = $this->findImage($session, $imageId);
        $this->sessions->removeImage($image);

        return response()->json(['success' => true]);
    }

    public function preview(Request $request, ScanSession $session, int $imageId): Response
    {
        $this->authorizeOwner($request, $session);
        $image = $this->findImage($session, $imageId);

        $scratch = $this->sessions->newScratchDir();
        try {
            $bytes = file_get_contents($this->sessions->renderPreview($image, $scratch));
        } finally {
            $this->sessions->cleanupScratchDir($scratch);
        }

        return response($bytes, 200)->header('Content-Type', 'image/png');
    }

    public function createPdf(Request $request, ScanSession $session): JsonResponse
    {
        $this->authorizeOwner($request, $session);
        $data = $request->validate(['title' => ['sometimes', 'string', 'max:255']]);

        $document = $this->imagesToPdf->createDocument(
            $session,
            $request->user(),
            $data['title'] ?? 'Scanned document',
        );

        return response()->json(['document' => $document->toSummaryArray()], 201);
    }

    private function findImage(ScanSession $session, int $imageId): ScanSessionImage
    {
        $image = $session->images()->find($imageId);
        if (! $image) {
            throw ScanException::imageNotFound();
        }

        return $image;
    }

    private function authorizeOwner(Request $request, ScanSession $session): void
    {
        abort_if($session->user_id !== $request->user()->id, 403);
    }

    private function serializeImage(ScanSessionImage $image): array
    {
        return [
            'id' => $image->id,
            'position' => $image->position,
            'filename' => $image->original_filename,
            'widthPx' => $image->original_width_px,
            'heightPx' => $image->original_height_px,
            'params' => $image->params,
            'blankPageDetected' => $image->blank_page_detected,
        ];
    }
}
