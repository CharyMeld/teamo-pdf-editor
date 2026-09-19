<?php

namespace App\Http\Controllers\Api;

use App\Domain\Editing\Services\PageOperationService;
use App\Domain\Editing\Services\WorkingCopyManager;
use App\Exceptions\PageOperationException;
use App\Http\Controllers\Controller;
use App\Models\Document;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/**
 * Phase 3 (ORGANIZE / page management): every endpoint here operates on a
 * document's real "working copy" (see WorkingCopyManager's docblock and
 * ARCHITECTURE.md's Phase 3 section) — the ten real page operations,
 * undo/redo, Save, and Save As. No endpoint here ever touches the original
 * upload (`document_versions` version 1) or any prior saved version.
 */
class DocumentEditController extends Controller
{
    public function __construct(
        private readonly PageOperationService $operations,
        private readonly WorkingCopyManager $working,
    ) {}

    public function insert(Request $request, Document $document): JsonResponse
    {
        $this->authorizeEditable($request, $document);
        $data = $request->validate([
            'afterPage' => ['required', 'integer', 'min:0'],
            'source' => ['required', 'in:blank,upload'],
            'file' => ['required_if:source,upload', 'file', 'mimes:pdf'],
        ]);

        $result = $this->operations->insert(
            $document, $request->user(), (int) $data['afterPage'], $data['source'], $request->file('file'),
        );

        return response()->json($result);
    }

    public function delete(Request $request, Document $document): JsonResponse
    {
        $this->authorizeEditable($request, $document);
        $data = $request->validate(['pages' => ['required', 'array', 'min:1'], 'pages.*' => ['integer']]);

        return response()->json($this->operations->delete($document, $request->user(), $data['pages']));
    }

    public function reorder(Request $request, Document $document): JsonResponse
    {
        $this->authorizeEditable($request, $document);
        $data = $request->validate(['newOrder' => ['required', 'array', 'min:1'], 'newOrder.*' => ['integer']]);

        return response()->json($this->operations->reorder($document, $request->user(), $data['newOrder']));
    }

    public function duplicate(Request $request, Document $document): JsonResponse
    {
        $this->authorizeEditable($request, $document);
        $data = $request->validate(['pages' => ['required', 'array', 'min:1'], 'pages.*' => ['integer']]);

        return response()->json($this->operations->duplicate($document, $request->user(), $data['pages']));
    }

    public function rotate(Request $request, Document $document): JsonResponse
    {
        $this->authorizeEditable($request, $document);
        $data = $request->validate([
            'pages' => ['required', 'array', 'min:1'],
            'pages.*' => ['integer'],
            'degrees' => ['required', 'integer'],
        ]);

        return response()->json($this->operations->rotate($document, $request->user(), $data['pages'], (int) $data['degrees']));
    }

    public function extract(Request $request, Document $document): JsonResponse
    {
        $this->authorizeEditable($request, $document);
        $data = $request->validate(['pages' => ['required', 'array', 'min:1'], 'pages.*' => ['integer']]);

        $newDocument = $this->operations->extract($document, $request->user(), $data['pages']);

        return response()->json(['data' => $this->summarize($newDocument)], 201);
    }

    public function split(Request $request, Document $document): JsonResponse
    {
        $this->authorizeEditable($request, $document);
        $data = $request->validate([
            'ranges' => ['required', 'array', 'min:2'],
            'ranges.*' => ['array', 'size:2'],
            'ranges.*.*' => ['integer', 'min:1'],
        ]);

        $ranges = array_map(fn (array $r) => [(int) $r[0], (int) $r[1]], $data['ranges']);
        $newDocuments = $this->operations->split($document, $request->user(), $ranges);

        return response()->json(['data' => array_map($this->summarize(...), $newDocuments)], 201);
    }

    public function merge(Request $request, Document $document): JsonResponse
    {
        $this->authorizeEditable($request, $document);
        $data = $request->validate([
            'withDocumentId' => ['required', 'string'],
            'position' => ['required', 'in:before,after'],
        ]);

        $other = Document::where('uuid', $data['withDocumentId'])->first();
        if (! $other) {
            throw PageOperationException::foreignDocumentMismatch();
        }

        return response()->json($this->operations->merge($document, $request->user(), $other, $data['position']));
    }

    public function replace(Request $request, Document $document): JsonResponse
    {
        $this->authorizeEditable($request, $document);
        $data = $request->validate([
            'page' => ['required', 'integer', 'min:1'],
            'file' => ['required', 'file', 'mimes:pdf'],
            'replacementPage' => ['nullable', 'integer', 'min:1'],
        ]);

        $result = $this->operations->replace(
            $document, $request->user(), (int) $data['page'], $request->file('file'), (int) ($data['replacementPage'] ?? 1),
        );

        return response()->json($result);
    }

    public function crop(Request $request, Document $document): JsonResponse
    {
        $this->authorizeEditable($request, $document);
        $data = $request->validate([
            'pages' => ['required', 'array', 'min:1'],
            'pages.*' => ['integer'],
            'box' => ['required', 'array'],
            'box.x' => ['required', 'numeric'],
            'box.y' => ['required', 'numeric'],
            'box.width' => ['required', 'numeric', 'gt:0'],
            'box.height' => ['required', 'numeric', 'gt:0'],
        ]);

        return response()->json($this->operations->crop($document, $request->user(), $data['pages'], $data['box']));
    }

    public function undo(Request $request, Document $document): JsonResponse
    {
        $this->authorizeOwner($request, $document);
        $this->working->undo($document);

        return response()->json($this->serializeWorkingState($document->fresh()));
    }

    public function redo(Request $request, Document $document): JsonResponse
    {
        $this->authorizeOwner($request, $document);
        $this->working->redo($document);

        return response()->json($this->serializeWorkingState($document->fresh()));
    }

    public function save(Request $request, Document $document): JsonResponse
    {
        $this->authorizeOwner($request, $document);
        $version = $this->working->save($document, $request->user());

        return response()->json([
            'versionNumber' => $version->version_number,
            'document' => $this->summarize($document->fresh()),
        ]);
    }

    public function saveAs(Request $request, Document $document): JsonResponse
    {
        $this->authorizeOwner($request, $document);
        $data = $request->validate(['title' => ['required', 'string', 'max:255']]);

        $newDocument = $this->working->saveAs($document, $request->user(), $data['title']);

        return response()->json(['data' => $this->summarize($newDocument)], 201);
    }

    /**
     * Phase 7 (OCR): real bytes of the document's CURRENT state — the
     * pending working-copy step's file if one exists, otherwise the same
     * saved version `DocumentController::file()` serves — via
     * `WorkingCopyManager::currentAbsolutePath()`, the same resolver every
     * other working-copy read already uses. Added because
     * `DocumentController::file()` only ever serves `currentVersion` (the
     * last SAVE), so pdf.js's canvas/search-index reload after OCR
     * commits a step would otherwise keep re-fetching the exact same
     * pre-OCR bytes forever, until the user explicitly saves — confirmed
     * empirically with a real OCR run during Phase 7 testing before this
     * endpoint existed. Every other phase's edits never needed this
     * because they render through independent overlay layers, not a
     * reloaded pdf.js document (see ARCHITECTURE.md's Phase 7 section).
     *
     * `Cache-Control: no-store` overrides Laravel's `response()->file()`
     * default of `public` (with a `Last-Modified` the browser treats as
     * heuristically fresh) — this URL is NOT stable content like
     * `DocumentController::file()`'s saved version; the same URL can
     * legitimately return different bytes across calls as working-copy
     * steps commit. Confirmed empirically: without this header, Chrome
     * served the pre-OCR bytes from its HTTP cache on `reloadPdfDocument`'s
     * re-fetch of the identical URL, so pdf.js's search index kept
     * finding nothing on the just-OCR'd page — a real caching bug, not a
     * pdf.js/tesseract issue (the working file on disk was already
     * correct at that point, verified separately via `pdftotext`).
     */
    public function workingFile(Request $request, Document $document): BinaryFileResponse
    {
        $this->authorizeOwner($request, $document);

        $absolutePath = $this->working->currentAbsolutePath($document);

        return response()->file($absolutePath, [
            'Content-Type' => 'application/pdf',
            'Cache-Control' => 'no-store, must-revalidate',
        ]);
    }

    public function workingPages(Request $request, Document $document): JsonResponse
    {
        $this->authorizeOwner($request, $document);

        $step = $document->current_step_id !== null ? $document->currentStep : null;

        if ($step && is_array($step->pages_snapshot)) {
            $pages = array_map(fn (array $p) => [
                'pageNumber' => $p['pageNumber'],
                'widthPt' => $p['widthPt'],
                'heightPt' => $p['heightPt'],
                'thumbnailReady' => true,
            ], $step->pages_snapshot);

            return response()->json(['data' => $pages, 'source' => 'step', 'stepId' => $step->id]);
        }

        if ($step) {
            // Step committed but its thumbnail job hasn't finished yet — real
            // "not ready" state, not a fake full page list.
            return response()->json(['data' => [], 'source' => 'step', 'stepId' => $step->id, 'pending' => true]);
        }

        $version = $this->working->baseVersion($document);
        $pages = $version->pages()->orderBy('page_number')->get()->map(fn ($p) => [
            'pageNumber' => $p->page_number,
            'widthPt' => $p->width_pt,
            'heightPt' => $p->height_pt,
            'thumbnailReady' => $p->thumbnail_path !== null,
        ]);

        return response()->json(['data' => $pages, 'source' => 'version', 'versionId' => $version->id]);
    }

    public function workingThumbnail(Request $request, Document $document, int $pageNumber): BinaryFileResponse|JsonResponse
    {
        $this->authorizeOwner($request, $document);

        $step = $document->current_step_id !== null ? $document->currentStep : null;

        if ($step) {
            $snapshotPage = collect($step->pages_snapshot ?? [])->firstWhere('pageNumber', $pageNumber);
            if (! $snapshotPage) {
                return response()->json(['error' => ['message' => 'Thumbnail not ready yet.', 'code' => 404]], 404);
            }
            $absolutePath = Storage::disk('documents')->path($snapshotPage['thumbnailPath']);
            abort_unless(is_file($absolutePath), 404);

            return response()->file($absolutePath, ['Content-Type' => 'image/png']);
        }

        $version = $this->working->baseVersion($document);
        $page = $version->pages()->where('page_number', $pageNumber)->first();
        if (! $page || ! $page->thumbnail_path) {
            return response()->json(['error' => ['message' => 'Thumbnail not ready yet.', 'code' => 404]], 404);
        }
        $absolutePath = Storage::disk('documents')->path($page->thumbnail_path);
        abort_unless(is_file($absolutePath), 404);

        return response()->file($absolutePath, ['Content-Type' => 'image/png']);
    }

    private function authorizeOwner(Request $request, Document $document): void
    {
        abort_if($document->user_id !== $request->user()->id, 403);
    }

    /**
     * Editing requires the document's initial (or post-save) render to
     * have completed — before that, `page_count`/`document_pages` aren't
     * trustworthy yet (see PageOperationService::merge's docblock note),
     * so operations are refused with a clear error rather than silently
     * working against a wrong page count.
     */
    private function authorizeEditable(Request $request, Document $document): void
    {
        $this->authorizeOwner($request, $document);
        if ($document->status !== 'ready') {
            throw PageOperationException::documentNotReady();
        }
    }

    private function serializeWorkingState(Document $document): array
    {
        return [
            'pageCount' => $this->working->currentPageCount($document),
            'currentStepId' => $document->current_step_id,
            'canUndo' => $this->working->canUndo($document),
            'canRedo' => $this->working->canRedo($document),
        ];
    }

    private function summarize(Document $document): array
    {
        return [
            'id' => $document->uuid,
            'title' => $document->title,
            'status' => $document->status,
            'pageCount' => $document->page_count,
        ];
    }
}
