<?php

namespace App\Domain\Editing\Services;

use App\Domain\Audit\Services\AuditLogger;
use App\Exceptions\PageOperationException;
use App\Models\Document;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Str;

/**
 * Phase 4 (real PDF content editing — TEXT/IMAGE/OBJECT commands): manages
 * "content objects" (added text, text-overlay edits, inserted images) drawn
 * on top of the document's real page content via `PdfContentEngine`.
 *
 * HONEST SCOPE BOUNDARY (see ARCHITECTURE.md's Phase 4 section for the full
 * rationale) — read before extending this class:
 *  - "Add text" is TRUE new PDF content: real text, real font/size/style/
 *    color/alignment/line-spacing, composed into the actual page.
 *  - "Edit text" is an OVERLAY EDIT (`type: 'text_overlay_edit'`): a
 *    background-matching rectangle covers the original text's bounding box,
 *    with new real text drawn on top. This is clearly tagged as distinct
 *    from true source modification — true in-place reflow of arbitrary
 *    pre-existing PDF text is not reliably achievable and is NOT attempted.
 *  - "Insert image" is a TRUE new embedded image (XObject). Its own
 *    select/move/resize/rotate/delete/duplicate are fully real because this
 *    system placed it and therefore knows its exact parameters.
 *  - Manipulating a PRE-EXISTING image already embedded in the original PDF
 *    (parsing and rewriting an unknown foreign content stream's placement
 *    matrix) is explicitly OUT OF SCOPE for Phase 4 — not attempted, not
 *    faked. This module only ever manages objects it itself created.
 *
 * RECOMPOSITION MODEL — this is the mechanism that makes move/resize/
 * rotate/delete/duplicate all correct and idempotent, reusing Phase 3's
 * `document_edit_operations` step/pointer chain rather than inventing a
 * second, parallel "current state" structure:
 *
 * Each content mutation is committed as a NEW working-copy step (via
 * `WorkingCopyManager::commitStep()`, exactly like Phase 3's page
 * operations), whose `payload` JSON holds:
 *   - `contentObjects`: the FULL current object list for the whole
 *     document (every object, including inactive/deleted ones, so undo can
 *     resurrect one for free just by the pointer moving back).
 *   - `sourceStepId` / `sourceVersionId` (exactly one non-null): which
 *     working-copy state has NO content objects of its own baked in yet —
 *     the "clean" page-structure base every content step recomposes from
 *     scratch, every time, so objects never stack/ghost.
 *
 * When the current step is ITSELF a content step, a new content mutation
 * inherits that step's `sourceStepId`/`sourceVersionId` (not the step's own
 * output file) — always rebuilding from the same clean base plus the
 * updated object list. When the current step is a PAGE operation (or there
 * is no current step), THAT state is clean by definition and becomes the
 * new content chain's source, starting from an empty object list.
 *
 * DELIBERATE, DOCUMENTED LIMITATION: once a page-structural operation
 * (rotate/crop/delete/reorder/...) runs on top of a working state that has
 * active content objects, those objects' pixels/text are permanently part
 * of the page from then on (qpdf carries real content through correctly),
 * but they stop being independently selectable/movable/deletable as
 * objects — the next content operation starts a fresh, empty object chain
 * from that point. This is analogous to "flattening" in other editors and
 * is an honest, intentional scope boundary, not an oversight.
 */
class ContentObjectService
{
    private const CONTENT_TYPES = ['text', 'text_overlay_edit', 'image'];

    public function __construct(
        private readonly PdfContentEngine $engine,
        private readonly WorkingCopyManager $working,
        private readonly ImageNormalizationService $images,
    ) {}

    /** @return array{operationId: int, sequenceNumber: int, objectId: string, pageCount: int, thumbnailJobId: int, status: string, canUndo: bool, canRedo: bool} */
    public function addObject(Document $document, User $user, array $data, ?UploadedFile $imageFile): array
    {
        $pageCount = $this->working->currentPageCount($document);
        $page = (int) $data['page'];
        if ($page < 1 || $page > $pageCount) {
            throw PageOperationException::invalidPageNumbers([$page], $pageCount);
        }

        $type = $data['type'];
        if (! in_array($type, self::CONTENT_TYPES, true)) {
            throw PageOperationException::processingFailed("unknown content object type '{$type}'.");
        }

        $params = $this->normalizeParams($type, $data['params'] ?? [], $document, $user, $imageFile);

        $objectId = (string) Str::uuid();
        $object = [
            'objectId' => $objectId,
            'type' => $type,
            'page' => $page,
            'x' => (float) $data['x'],
            'y' => (float) $data['y'],
            'width' => (float) $data['width'],
            'height' => (float) $data['height'],
            'rotation' => (float) ($data['rotation'] ?? 0),
            'zIndex' => (int) ($data['zIndex'] ?? 0),
            'active' => true,
            'params' => $params,
        ];
        $this->assertPositiveSize($object);

        [$objects, $sourceStepId, $sourceVersionId] = $this->currentChainState($document);
        $objects[] = $object;

        $result = $this->recomposeAndCommit(
            $document, $user,
            $type === 'text_overlay_edit' ? 'content_edit_text' : ($type === 'image' ? 'content_insert_image' : 'content_add_text'),
            $objects, $sourceStepId, $sourceVersionId,
        );

        AuditLogger::record('document.content.added', $document, ['objectId' => $objectId, 'type' => $type]);

        return $result + ['objectId' => $objectId];
    }

    /** @return array{operationId: int, sequenceNumber: int, objectId: string, pageCount: int, thumbnailJobId: int, status: string, canUndo: bool, canRedo: bool} */
    public function updateObject(Document $document, User $user, string $objectId, array $changes): array
    {
        [$objects, $sourceStepId, $sourceVersionId] = $this->currentChainState($document);

        $found = false;
        foreach ($objects as &$object) {
            if ($object['objectId'] !== $objectId || ! $object['active']) {
                continue;
            }
            $found = true;

            foreach (['x', 'y', 'width', 'height', 'rotation', 'zIndex'] as $numericField) {
                if (array_key_exists($numericField, $changes)) {
                    $object[$numericField] = $numericField === 'zIndex' ? (int) $changes[$numericField] : (float) $changes[$numericField];
                }
            }
            if (array_key_exists('params', $changes) && is_array($changes['params'])) {
                $object['params'] = $this->normalizeParams($object['type'], array_merge($object['params'], $changes['params']), $document, $user, null);
            }
            $this->assertPositiveSize($object);
            break;
        }
        unset($object);

        if (! $found) {
            throw PageOperationException::objectNotFound();
        }

        $result = $this->recomposeAndCommit($document, $user, 'content_update_object', $objects, $sourceStepId, $sourceVersionId);

        AuditLogger::record('document.content.updated', $document, ['objectId' => $objectId]);

        return $result + ['objectId' => $objectId];
    }

    public function deleteObject(Document $document, User $user, string $objectId): array
    {
        [$objects, $sourceStepId, $sourceVersionId] = $this->currentChainState($document);

        $found = false;
        foreach ($objects as &$object) {
            if ($object['objectId'] === $objectId && $object['active']) {
                $object['active'] = false;
                $found = true;
                break;
            }
        }
        unset($object);

        if (! $found) {
            throw PageOperationException::objectNotFound();
        }

        $result = $this->recomposeAndCommit($document, $user, 'content_delete_object', $objects, $sourceStepId, $sourceVersionId);

        AuditLogger::record('document.content.deleted', $document, ['objectId' => $objectId]);

        return $result + ['objectId' => $objectId];
    }

    public function duplicateObject(Document $document, User $user, string $objectId): array
    {
        [$objects, $sourceStepId, $sourceVersionId] = $this->currentChainState($document);

        $source = null;
        foreach ($objects as $object) {
            if ($object['objectId'] === $objectId && $object['active']) {
                $source = $object;
                break;
            }
        }
        if ($source === null) {
            throw PageOperationException::objectNotFound();
        }

        $newObjectId = (string) Str::uuid();
        $clone = $source;
        $clone['objectId'] = $newObjectId;
        $clone['x'] += 12.0;
        $clone['y'] -= 12.0; // bottom-left origin: nudge "down and right" visually means -y here
        $clone['zIndex'] = $source['zIndex'] + 1;
        $objects[] = $clone;

        $result = $this->recomposeAndCommit($document, $user, 'content_duplicate_object', $objects, $sourceStepId, $sourceVersionId);

        AuditLogger::record('document.content.duplicated', $document, ['objectId' => $newObjectId, 'sourceObjectId' => $objectId]);

        return $result + ['objectId' => $newObjectId];
    }

    /** Real current active objects for a page — used by GET .../content/objects. */
    public function listActiveObjects(Document $document, ?int $page = null): array
    {
        [$objects] = $this->currentChainState($document);

        $objects = array_values(array_filter($objects, fn (array $o) => $o['active']));
        if ($page !== null) {
            $objects = array_values(array_filter($objects, fn (array $o) => $o['page'] === $page));
        }

        return array_map(fn (array $o) => [
            'objectId' => $o['objectId'],
            'type' => $o['type'],
            'page' => $o['page'],
            'x' => $o['x'],
            'y' => $o['y'],
            'width' => $o['width'],
            'height' => $o['height'],
            'rotation' => $o['rotation'],
            'zIndex' => $o['zIndex'],
            'params' => $this->publicParams($o),
        ], $objects);
    }

    /**
     * The current object chain's state: the full object array (active AND
     * inactive — needed so update/delete/duplicate can find/resurrect by
     * id), and the clean page-structure source it's built on. See this
     * class's docblock for the full rationale.
     *
     * @return array{0: list<array>, 1: ?int, 2: ?int}
     */
    private function currentChainState(Document $document): array
    {
        $currentStep = $document->current_step_id !== null ? $document->currentStep : null;

        if ($currentStep && str_starts_with($currentStep->operation_type, 'content_')) {
            $payload = $currentStep->payload;

            return [$payload['contentObjects'] ?? [], $payload['sourceStepId'] ?? null, $payload['sourceVersionId'] ?? null];
        }

        // Current state (a page op's step, or no step at all) is clean —
        // no content objects of its own — so it becomes the new chain's base.
        if ($currentStep) {
            return [[], $currentStep->id, null];
        }

        $version = $this->working->baseVersion($document);

        return [[], null, $version->id];
    }

    private function recomposeAndCommit(
        Document $document,
        User $user,
        string $operationType,
        array $objects,
        ?int $sourceStepId,
        ?int $sourceVersionId,
    ): array {
        $sourcePath = $this->working->resolveAbsolutePath($sourceStepId, $sourceVersionId);
        $pageCount = $this->working->currentPageCount($document);

        $objectsByPage = [];
        foreach ($objects as $object) {
            if (! $object['active']) {
                continue;
            }
            $objectsByPage[$object['page']][] = $object;
        }

        $scratch = $this->working->newScratchDir();
        try {
            $outPath = $scratch.'/result.pdf';
            $this->engine->compose($sourcePath, $outPath, $objectsByPage);

            $stepResult = $this->working->commitStep($document, $user, $operationType, [
                'contentObjects' => $objects,
                'sourceStepId' => $sourceStepId,
                'sourceVersionId' => $sourceVersionId,
            ], $outPath, $pageCount);
        } finally {
            $this->working->cleanupScratchDir($scratch);
        }

        $step = $stepResult['step'];
        $job = $stepResult['job'];

        return [
            'operationId' => $step->id,
            'sequenceNumber' => $step->sequence_number,
            'pageCount' => $step->page_count_after,
            'thumbnailJobId' => $job->id,
            'status' => 'processing',
            'canUndo' => true,
            'canRedo' => false,
        ];
    }

    private function normalizeParams(string $type, array $params, Document $document, User $user, ?UploadedFile $imageFile): array
    {
        if ($type === 'image') {
            return $this->normalizeImageParams($params, $document, $user, $imageFile);
        }

        // 'text' and 'text_overlay_edit' share the same text-styling params.
        $text = trim((string) ($params['text'] ?? ''));
        if ($text === '') {
            throw PageOperationException::invalidTextParams('text must not be empty.');
        }

        $font = $params['font'] ?? 'Helvetica';
        $resolvedFont = $font === 'Arial' ? 'Helvetica' : $font;
        if (! in_array($resolvedFont, PdfContentEngine::AVAILABLE_FONTS, true)) {
            throw PageOperationException::invalidFont($font);
        }

        $fontSize = (float) ($params['fontSize'] ?? 12);
        if ($fontSize <= 0 || $fontSize > 400) {
            throw PageOperationException::invalidTextParams('fontSize must be a positive number (up to 400).');
        }

        $align = $params['align'] ?? 'left';
        if (! in_array($align, ['left', 'center', 'right', 'justify'], true)) {
            throw PageOperationException::invalidTextParams("align must be one of left, center, right, justify (got '{$align}').");
        }

        $lineSpacing = (float) ($params['lineSpacing'] ?? 1.2);
        if ($lineSpacing <= 0 || $lineSpacing > 5) {
            throw PageOperationException::invalidTextParams('lineSpacing must be a positive number (up to 5).');
        }

        $this->assertHexColor($params['color'] ?? '#000000');

        $normalized = [
            'text' => $text,
            'font' => $font,
            'fontSize' => $fontSize,
            'bold' => (bool) ($params['bold'] ?? false),
            'italic' => (bool) ($params['italic'] ?? false),
            'color' => $params['color'] ?? '#000000',
            'align' => $align,
            'lineSpacing' => $lineSpacing,
            // A signature is not a new object type — it's this same text
            // object, flagged so the frontend can render the "visual mark,
            // not a cryptographic signature" honesty note. See Phase 11.
            'isSignature' => (bool) ($params['isSignature'] ?? false),
        ];

        if ($type === 'text_overlay_edit') {
            $cover = $params['coverOriginal'] ?? null;
            if (! is_array($cover) || ! isset($cover['x'], $cover['y'], $cover['width'], $cover['height'])) {
                throw PageOperationException::invalidTextParams("an 'edit text' object requires coverOriginal: {x, y, width, height}.");
            }
            $coverColor = $params['coverColor'] ?? '#FFFFFF';
            $this->assertHexColor($coverColor);

            $normalized['coverOriginal'] = [
                'x' => (float) $cover['x'], 'y' => (float) $cover['y'],
                'width' => (float) $cover['width'], 'height' => (float) $cover['height'],
            ];
            $normalized['coverColor'] = $coverColor;
        }

        return $normalized;
    }

    private function normalizeImageParams(array $params, Document $document, User $user, ?UploadedFile $imageFile): array
    {
        // On update (no new file given), keep the existing stored image.
        if (! $imageFile) {
            if (! isset($params['storagePath'])) {
                throw PageOperationException::invalidImageSource();
            }

            return [
                'storagePath' => $params['storagePath'],
                'originalFilename' => $params['originalFilename'] ?? null,
                'isSignature' => (bool) ($params['isSignature'] ?? false),
            ];
        }

        // Unlike a page operation's scratch files, an inserted image must
        // persist for the lifetime of the object, since every future
        // content edit recomposes the page from scratch and needs to
        // redraw it — see ImageNormalizationService for the actual
        // validate/normalize/store logic (shared with Phase 5's stamp
        // annotation image variant).
        $storagePath = $this->images->store($imageFile, $document, 'content-assets');

        return [
            'storagePath' => $storagePath,
            'originalFilename' => $imageFile->getClientOriginalName(),
            'isSignature' => (bool) ($params['isSignature'] ?? false),
        ];
    }

    private function assertHexColor(string $hex): void
    {
        $stripped = ltrim($hex, '#');
        if (strlen($stripped) === 3) {
            $stripped = $stripped[0].$stripped[0].$stripped[1].$stripped[1].$stripped[2].$stripped[2];
        }
        if (! preg_match('/^[0-9a-fA-F]{6}$/', $stripped)) {
            throw PageOperationException::invalidColor($hex);
        }
    }

    private function assertPositiveSize(array $object): void
    {
        if ($object['width'] <= 0 || $object['height'] <= 0) {
            throw PageOperationException::invalidTextParams('width and height must be positive.');
        }
    }

    /** Strips internal-only fields (e.g. an image's disk storagePath) before returning params to the client. */
    private function publicParams(array $object): array
    {
        if ($object['type'] !== 'image') {
            return $object['params'];
        }

        return [
            'originalFilename' => $object['params']['originalFilename'] ?? null,
            'isSignature' => (bool) ($object['params']['isSignature'] ?? false),
        ];
    }
}
