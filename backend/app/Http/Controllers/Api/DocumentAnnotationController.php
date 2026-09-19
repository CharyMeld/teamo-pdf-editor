<?php

namespace App\Http\Controllers\Api;

use App\Domain\Editing\Services\AnnotationService;
use App\Domain\Editing\Services\PdfAnnotationEngine;
use App\Http\Controllers\Api\Concerns\AuthorizesDocumentAccess;
use App\Http\Controllers\Controller;
use App\Models\Document;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Phase 5 (real PDF annotation engine — ANNOTATE ribbon commands): every
 * endpoint here operates on the document's working copy, exactly like
 * Phase 4's `DocumentContentController` — see `AnnotationService`'s
 * docblock for the full recomposition-chain picture and how it coexists
 * with Phase 4's own chain. No endpoint here ever touches the original
 * upload or a prior saved version.
 */
class DocumentAnnotationController extends Controller
{
    use AuthorizesDocumentAccess;

    public function __construct(private readonly AnnotationService $annotations) {}

    public function index(Request $request, Document $document): JsonResponse
    {
        $this->authorizeOwner($request, $document);
        $page = $request->integer('page') ?: null;

        return response()->json([
            'data' => $this->annotations->listActiveAnnotations($document, $page),
            'stampPresets' => PdfAnnotationEngine::STAMP_PRESETS,
        ]);
    }

    public function store(Request $request, Document $document): JsonResponse
    {
        $this->authorizeEditable($request, $document);
        $data = $this->validateAnnotationPayload($request);

        $result = $this->annotations->addAnnotation($document, $request->user(), $data, $request->file('file'));

        return response()->json($result, 201);
    }

    public function update(Request $request, Document $document, string $annotationId): JsonResponse
    {
        $this->authorizeEditable($request, $document);
        $data = $request->validate([
            'x' => ['sometimes', 'numeric'],
            'y' => ['sometimes', 'numeric'],
            'width' => ['sometimes', 'numeric', 'gt:0'],
            'height' => ['sometimes', 'numeric', 'gt:0'],
            'rotation' => ['sometimes', 'numeric'],
            'zIndex' => ['sometimes', 'integer'],
            'x2' => ['sometimes', 'numeric'],
            'y2' => ['sometimes', 'numeric'],
            'params' => ['sometimes', 'array'],
        ]);

        return response()->json($this->annotations->updateAnnotation($document, $request->user(), $annotationId, $data));
    }

    public function destroy(Request $request, Document $document, string $annotationId): JsonResponse
    {
        $this->authorizeEditable($request, $document);

        return response()->json($this->annotations->deleteAnnotation($document, $request->user(), $annotationId));
    }

    public function duplicate(Request $request, Document $document, string $annotationId): JsonResponse
    {
        $this->authorizeEditable($request, $document);

        return response()->json($this->annotations->duplicateAnnotation($document, $request->user(), $annotationId));
    }

    /**
     * Shared validation for POST .../annotations — shape depends on `type`.
     * Deliberately loose at this layer for anything the service's own
     * `normalizeParams()` re-validates semantically (hex color format,
     * numeric ranges) — this layer only enforces required-ness/basic type,
     * the same division of labor `DocumentContentController` already uses.
     */
    private function validateAnnotationPayload(Request $request): array
    {
        $base = $request->validate([
            'type' => ['required', 'in:highlight,underline,strikethrough,freehand,rectangle,circle,arrow,text_box,sticky_note,stamp'],
            'page' => ['required', 'integer', 'min:1'],
            'x' => ['required', 'numeric'],
            'y' => ['required', 'numeric'],
            'width' => ['required', 'numeric', 'gt:0'],
            'height' => ['required', 'numeric', 'gt:0'],
            'rotation' => ['sometimes', 'numeric'],
            'zIndex' => ['sometimes', 'integer'],
            'x2' => [$request->input('type') === 'arrow' ? 'required' : 'sometimes', 'numeric'],
            'y2' => [$request->input('type') === 'arrow' ? 'required' : 'sometimes', 'numeric'],
        ]);

        if ($base['type'] === 'stamp' && $request->hasFile('file')) {
            $request->validate(['file' => ['required', 'file', 'image']]);
        }

        $paramsRules = match ($base['type']) {
            'highlight' => ['params.color' => ['sometimes', 'string'], 'params.opacity' => ['sometimes', 'numeric']],
            'underline', 'strikethrough' => ['params.color' => ['sometimes', 'string'], 'params.thickness' => ['sometimes', 'numeric']],
            'rectangle', 'circle' => [
                'params.strokeColor' => ['sometimes', 'string'],
                'params.strokeWidth' => ['sometimes', 'numeric'],
                'params.fillColor' => ['sometimes', 'string'],
                'params.fillOpacity' => ['sometimes', 'numeric'],
            ],
            'freehand' => [
                'params.points' => ['required', 'array', 'min:2'],
                'params.points.*.x' => ['required', 'numeric'],
                'params.points.*.y' => ['required', 'numeric'],
                'params.color' => ['sometimes', 'string'],
                'params.thickness' => ['sometimes', 'numeric'],
                // A drawn signature is not a new annotation type — it's this
                // same freehand stroke, flagged so the frontend can render
                // the "visual mark, not a cryptographic signature" honesty
                // note. See Phase 11.
                'params.isSignature' => ['sometimes', 'boolean'],
            ],
            'arrow' => ['params.color' => ['sometimes', 'string'], 'params.thickness' => ['sometimes', 'numeric']],
            'text_box' => [
                'params.text' => ['required', 'string'],
                'params.font' => ['sometimes', 'string'],
                'params.fontSize' => ['sometimes', 'numeric'],
                'params.bold' => ['sometimes', 'boolean'],
                'params.italic' => ['sometimes', 'boolean'],
                'params.color' => ['sometimes', 'string'],
                'params.align' => ['sometimes', 'string'],
                'params.lineSpacing' => ['sometimes', 'numeric'],
                'params.backgroundColor' => ['sometimes', 'string'],
                'params.borderColor' => ['sometimes', 'string'],
            ],
            // `nullable` on `note`: Laravel's ConvertEmptyStringsToNull
            // middleware turns an empty note (a deliberately valid, common
            // case — the comment can be added later via the Smart
            // Inspector) into `null` before validation ever sees it; plain
            // `sometimes|string` only skips a genuinely ABSENT key, so a
            // present-but-null value still failed `string` here.
            'sticky_note' => ['params.note' => ['sometimes', 'nullable', 'string'], 'params.color' => ['sometimes', 'string']],
            'stamp' => [
                'params.stampKind' => ['sometimes', 'in:preset,image'],
                'params.presetKey' => ['sometimes', 'string'],
                'params.storagePath' => ['sometimes', 'string'],
                'params.originalFilename' => ['sometimes', 'string'],
            ],
            default => [],
        };

        $params = $request->validate($paramsRules);

        return array_merge($base, $params);
    }
}
