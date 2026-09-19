<?php

namespace App\Http\Controllers\Api;

use App\Domain\Editing\Services\ContentObjectService;
use App\Domain\Editing\Services\PdfContentEngine;
use App\Http\Controllers\Api\Concerns\AuthorizesDocumentAccess;
use App\Http\Controllers\Controller;
use App\Models\Document;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Phase 4 (real PDF content editing — TEXT/IMAGE/OBJECT ribbon commands):
 * every endpoint here operates on the document's working copy (the same
 * `document_edit_operations` chain Phase 3's page operations use — see
 * ContentObjectService's docblock and ARCHITECTURE.md's Phase 4 section).
 * No endpoint here ever touches the original upload or a prior saved
 * version. Undo/redo/Save/Save As are unchanged from Phase 3 — content
 * edits are just another kind of working-copy step.
 */
class DocumentContentController extends Controller
{
    use AuthorizesDocumentAccess;

    public function __construct(private readonly ContentObjectService $content) {}

    public function index(Request $request, Document $document): JsonResponse
    {
        $this->authorizeOwner($request, $document);
        $page = $request->integer('page') ?: null;

        return response()->json([
            'data' => $this->content->listActiveObjects($document, $page),
            'availableFonts' => PdfContentEngine::AVAILABLE_FONTS,
        ]);
    }

    public function store(Request $request, Document $document): JsonResponse
    {
        $this->authorizeEditable($request, $document);
        $data = $this->validateObjectPayload($request);

        $result = $this->content->addObject($document, $request->user(), $data, $request->file('file'));

        return response()->json($result, 201);
    }

    public function update(Request $request, Document $document, string $objectId): JsonResponse
    {
        $this->authorizeEditable($request, $document);
        $data = $request->validate([
            'x' => ['sometimes', 'numeric'],
            'y' => ['sometimes', 'numeric'],
            'width' => ['sometimes', 'numeric', 'gt:0'],
            'height' => ['sometimes', 'numeric', 'gt:0'],
            'rotation' => ['sometimes', 'numeric'],
            'zIndex' => ['sometimes', 'integer'],
            'params' => ['sometimes', 'array'],
        ]);

        return response()->json($this->content->updateObject($document, $request->user(), $objectId, $data));
    }

    public function destroy(Request $request, Document $document, string $objectId): JsonResponse
    {
        $this->authorizeEditable($request, $document);

        return response()->json($this->content->deleteObject($document, $request->user(), $objectId));
    }

    public function duplicate(Request $request, Document $document, string $objectId): JsonResponse
    {
        $this->authorizeEditable($request, $document);

        return response()->json($this->content->duplicateObject($document, $request->user(), $objectId));
    }

    /** Shared validation for POST .../content/objects — shape depends on `type`. */
    private function validateObjectPayload(Request $request): array
    {
        $base = $request->validate([
            'type' => ['required', 'in:text,text_overlay_edit,image'],
            'page' => ['required', 'integer', 'min:1'],
            'x' => ['required', 'numeric'],
            'y' => ['required', 'numeric'],
            'width' => ['required', 'numeric', 'gt:0'],
            'height' => ['required', 'numeric', 'gt:0'],
            'rotation' => ['sometimes', 'numeric'],
            'zIndex' => ['sometimes', 'integer'],
        ]);

        if ($base['type'] === 'image') {
            // Phase 14 hardening: previously no app-level size limit here.
            $maxKb = (int) config('documents.max_image_upload_mb', 20) * 1024;
            $request->validate(['file' => ['required', 'file', 'image', "max:{$maxKb}"]]);
            $base['params'] = $request->validate([
                'params.isSignature' => ['sometimes', 'boolean'],
            ])['params'] ?? [];

            return $base;
        }

        $params = $request->validate([
            'params' => ['required', 'array'],
            'params.text' => ['required', 'string'],
            'params.font' => ['sometimes', 'string'],
            'params.fontSize' => ['sometimes', 'numeric'],
            'params.bold' => ['sometimes', 'boolean'],
            'params.italic' => ['sometimes', 'boolean'],
            'params.color' => ['sometimes', 'string'],
            'params.align' => ['sometimes', 'string'],
            'params.lineSpacing' => ['sometimes', 'numeric'],
            'params.coverOriginal' => [$base['type'] === 'text_overlay_edit' ? 'required' : 'sometimes', 'array'],
            'params.coverColor' => ['sometimes', 'string'],
            // A signature is not a new object type — it's this same text
            // object, flagged so the frontend can render the "visual mark,
            // not a cryptographic signature" honesty note. See Phase 11.
            'params.isSignature' => ['sometimes', 'boolean'],
        ]);

        return array_merge($base, $params);
    }
}
