<?php

namespace App\Domain\Editing\Services;

use App\Domain\Audit\Services\AuditLogger;
use App\Exceptions\PageOperationException;
use App\Models\Document;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Str;

/**
 * Phase 5 (real PDF annotation engine — ANNOTATE ribbon commands): manages
 * annotation objects (highlight, underline, strikethrough, freehand,
 * rectangle, circle, arrow, text box, sticky note, stamp) drawn on top of
 * the document's real page content via `PdfAnnotationEngine`.
 *
 * This is a PARALLEL, independent sibling to `ContentObjectService`
 * (Phase 4) — not a modification of it, and Phase 4 needed zero changes
 * for this to exist. It reuses the exact same recomposition-chain
 * mechanism, generalized to a SECOND, independent chain distinguished by
 * its own `annotation_*` operation-type prefix (see `currentChainState()`).
 *
 * INTERLEAVING SEMANTICS (Phase 4's own "flattening" rule, applied a
 * second time, not a new concept): a content edit (Phase 4) followed by an
 * annotation edit sees a non-`annotation_`-prefixed current step, so it
 * starts a fresh, empty annotation chain (correct — none exist yet).
 * Symmetrically, an annotation edit followed by a further content edit
 * sees a non-`content_`-prefixed current step, so ContentObjectService's
 * own `currentChainState()` treats it as clean too — any content objects
 * present get flattened (their pixels remain, baked in by the annotation
 * step's own recomposition, but they stop being independently selectable),
 * exactly like Phase 4 already documented for a Phase 3 page operation
 * running on top of active content objects. No code in either service
 * needs to know about the other's existence for this to be correct.
 *
 * HONEST SCOPE BOUNDARY — see `PdfAnnotationEngine`'s docblock for the
 * per-type detail (sticky note's comment text is never rendered onto the
 * page itself, stamp's "preset" variant is a drawn badge not a real
 * embedded image, etc.).
 */
class AnnotationService
{
    private const ANNOTATION_TYPES = [
        'highlight', 'underline', 'strikethrough', 'freehand',
        'rectangle', 'circle', 'arrow', 'text_box', 'sticky_note', 'stamp',
    ];

    public function __construct(
        private readonly PdfAnnotationEngine $engine,
        private readonly WorkingCopyManager $working,
        private readonly ImageNormalizationService $images,
    ) {}

    /** @return array{operationId: int, sequenceNumber: int, annotationId: string, pageCount: int, thumbnailJobId: int, status: string, canUndo: bool, canRedo: bool} */
    public function addAnnotation(Document $document, User $user, array $data, ?UploadedFile $imageFile): array
    {
        $pageCount = $this->working->currentPageCount($document);
        $page = (int) $data['page'];
        if ($page < 1 || $page > $pageCount) {
            throw PageOperationException::invalidPageNumbers([$page], $pageCount);
        }

        $type = $data['type'];
        if (! in_array($type, self::ANNOTATION_TYPES, true)) {
            throw PageOperationException::processingFailed("unknown annotation type '{$type}'.");
        }

        $params = $this->normalizeParams($type, $data['params'] ?? [], $document, $imageFile);

        $annotationId = (string) Str::uuid();
        $annotation = [
            'annotationId' => $annotationId,
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
        if ($type === 'arrow') {
            $annotation['x2'] = (float) ($data['x2'] ?? $annotation['x'] + $annotation['width']);
            $annotation['y2'] = (float) ($data['y2'] ?? $annotation['y'] + $annotation['height']);
        }
        $this->assertPositiveSize($annotation);

        [$annotations, $sourceStepId, $sourceVersionId] = $this->currentChainState($document);
        $annotations[] = $annotation;

        $result = $this->recomposeAndCommit($document, $user, 'annotation_create', $annotations, $sourceStepId, $sourceVersionId);

        AuditLogger::record('document.annotation.added', $document, ['annotationId' => $annotationId, 'type' => $type]);

        return $result + ['annotationId' => $annotationId];
    }

    /** @return array{operationId: int, sequenceNumber: int, annotationId: string, pageCount: int, thumbnailJobId: int, status: string, canUndo: bool, canRedo: bool} */
    public function updateAnnotation(Document $document, User $user, string $annotationId, array $changes): array
    {
        [$annotations, $sourceStepId, $sourceVersionId] = $this->currentChainState($document);

        $found = false;
        foreach ($annotations as &$annotation) {
            if ($annotation['annotationId'] !== $annotationId || ! $annotation['active']) {
                continue;
            }
            $found = true;

            foreach (['x', 'y', 'width', 'height', 'rotation', 'zIndex', 'x2', 'y2'] as $numericField) {
                if (array_key_exists($numericField, $changes)) {
                    $annotation[$numericField] = $numericField === 'zIndex' ? (int) $changes[$numericField] : (float) $changes[$numericField];
                }
            }
            if (array_key_exists('params', $changes) && is_array($changes['params'])) {
                $annotation['params'] = $this->normalizeParams($annotation['type'], array_merge($annotation['params'], $changes['params']), $document, null);
            }
            $this->assertPositiveSize($annotation);
            break;
        }
        unset($annotation);

        if (! $found) {
            throw PageOperationException::annotationNotFound();
        }

        $result = $this->recomposeAndCommit($document, $user, 'annotation_update', $annotations, $sourceStepId, $sourceVersionId);

        AuditLogger::record('document.annotation.updated', $document, ['annotationId' => $annotationId]);

        return $result + ['annotationId' => $annotationId];
    }

    public function deleteAnnotation(Document $document, User $user, string $annotationId): array
    {
        [$annotations, $sourceStepId, $sourceVersionId] = $this->currentChainState($document);

        $found = false;
        foreach ($annotations as &$annotation) {
            if ($annotation['annotationId'] === $annotationId && $annotation['active']) {
                $annotation['active'] = false;
                $found = true;
                break;
            }
        }
        unset($annotation);

        if (! $found) {
            throw PageOperationException::annotationNotFound();
        }

        $result = $this->recomposeAndCommit($document, $user, 'annotation_delete', $annotations, $sourceStepId, $sourceVersionId);

        AuditLogger::record('document.annotation.deleted', $document, ['annotationId' => $annotationId]);

        return $result + ['annotationId' => $annotationId];
    }

    public function duplicateAnnotation(Document $document, User $user, string $annotationId): array
    {
        [$annotations, $sourceStepId, $sourceVersionId] = $this->currentChainState($document);

        $source = null;
        foreach ($annotations as $annotation) {
            if ($annotation['annotationId'] === $annotationId && $annotation['active']) {
                $source = $annotation;
                break;
            }
        }
        if ($source === null) {
            throw PageOperationException::annotationNotFound();
        }

        $newAnnotationId = (string) Str::uuid();
        $clone = $source;
        $clone['annotationId'] = $newAnnotationId;
        $clone['x'] += 12.0;
        $clone['y'] -= 12.0; // bottom-left origin: nudge "down and right" visually means -y here — same convention Phase 4's duplicate uses
        if ($clone['type'] === 'arrow') {
            $clone['x2'] = ($clone['x2'] ?? $clone['x']) + 12.0;
            $clone['y2'] = ($clone['y2'] ?? $clone['y']) - 12.0;
        }
        $clone['zIndex'] = $source['zIndex'] + 1;
        $annotations[] = $clone;

        $result = $this->recomposeAndCommit($document, $user, 'annotation_duplicate', $annotations, $sourceStepId, $sourceVersionId);

        AuditLogger::record('document.annotation.duplicated', $document, ['annotationId' => $newAnnotationId, 'sourceAnnotationId' => $annotationId]);

        return $result + ['annotationId' => $newAnnotationId];
    }

    /** Real current active annotations for a page — used by GET .../annotations. */
    public function listActiveAnnotations(Document $document, ?int $page = null): array
    {
        [$annotations] = $this->currentChainState($document);

        $annotations = array_values(array_filter($annotations, fn (array $a) => $a['active']));
        if ($page !== null) {
            $annotations = array_values(array_filter($annotations, fn (array $a) => $a['page'] === $page));
        }

        return array_map(function (array $a) {
            $public = [
                'annotationId' => $a['annotationId'],
                'type' => $a['type'],
                'page' => $a['page'],
                'x' => $a['x'],
                'y' => $a['y'],
                'width' => $a['width'],
                'height' => $a['height'],
                'rotation' => $a['rotation'],
                'zIndex' => $a['zIndex'],
                'params' => $this->publicParams($a),
            ];
            if ($a['type'] === 'arrow') {
                $public['x2'] = $a['x2'];
                $public['y2'] = $a['y2'];
            }

            return $public;
        }, $annotations);
    }

    /**
     * The current annotation chain's state — identical shape and rationale
     * to `ContentObjectService::currentChainState()`, distinguished only by
     * checking for the `annotation_` operation-type prefix instead of
     * `content_`. See this class's docblock for the interleaving semantics
     * this produces when the current step belongs to the OTHER chain.
     *
     * @return array{0: list<array>, 1: ?int, 2: ?int}
     */
    private function currentChainState(Document $document): array
    {
        $currentStep = $document->current_step_id !== null ? $document->currentStep : null;

        if ($currentStep && str_starts_with($currentStep->operation_type, 'annotation_')) {
            $payload = $currentStep->payload;

            return [$payload['annotations'] ?? [], $payload['sourceStepId'] ?? null, $payload['sourceVersionId'] ?? null];
        }

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
        array $annotations,
        ?int $sourceStepId,
        ?int $sourceVersionId,
    ): array {
        $sourcePath = $this->working->resolveAbsolutePath($sourceStepId, $sourceVersionId);
        $pageCount = $this->working->currentPageCount($document);

        $annotationsByPage = [];
        foreach ($annotations as $annotation) {
            if (! $annotation['active']) {
                continue;
            }
            $annotationsByPage[$annotation['page']][] = $annotation;
        }

        $scratch = $this->working->newScratchDir();
        try {
            $outPath = $scratch.'/result.pdf';
            $this->engine->compose($sourcePath, $outPath, $annotationsByPage);

            $stepResult = $this->working->commitStep($document, $user, $operationType, [
                'annotations' => $annotations,
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

    private function normalizeParams(string $type, array $params, Document $document, ?UploadedFile $imageFile): array
    {
        return match ($type) {
            'highlight' => $this->normalizeMarkParams($params, requireOpacity: true),
            'underline', 'strikethrough' => $this->normalizeMarkParams($params, requireOpacity: false),
            'rectangle', 'circle' => $this->normalizeShapeParams($params),
            'freehand' => $this->normalizeFreehandParams($params),
            'arrow' => $this->normalizeArrowParams($params),
            'text_box' => $this->normalizeTextBoxParams($params),
            'sticky_note' => $this->normalizeStickyNoteParams($params),
            'stamp' => $this->normalizeStampParams($params, $document, $imageFile),
            default => throw PageOperationException::processingFailed("unknown annotation type '{$type}'."),
        };
    }

    private function normalizeMarkParams(array $params, bool $requireOpacity): array
    {
        $color = $params['color'] ?? '#FFFF00';
        $this->assertHexColor($color);

        if ($requireOpacity) {
            $opacity = (float) ($params['opacity'] ?? 0.4);
            if ($opacity <= 0 || $opacity > 1) {
                throw PageOperationException::invalidAnnotationParams('opacity must be greater than 0 and at most 1.');
            }

            return ['color' => $color, 'opacity' => $opacity];
        }

        $thickness = (float) ($params['thickness'] ?? 1.5);
        if ($thickness <= 0 || $thickness > 40) {
            throw PageOperationException::invalidAnnotationParams('thickness must be a positive number (up to 40).');
        }

        return ['color' => $color, 'thickness' => $thickness];
    }

    private function normalizeShapeParams(array $params): array
    {
        $strokeColor = $params['strokeColor'] ?? '#000000';
        $this->assertHexColor($strokeColor);

        $strokeWidth = (float) ($params['strokeWidth'] ?? 1.5);
        if ($strokeWidth <= 0 || $strokeWidth > 40) {
            throw PageOperationException::invalidAnnotationParams('strokeWidth must be a positive number (up to 40).');
        }

        $normalized = ['strokeColor' => $strokeColor, 'strokeWidth' => $strokeWidth];

        if (! empty($params['fillColor'])) {
            $this->assertHexColor($params['fillColor']);
            $fillOpacity = (float) ($params['fillOpacity'] ?? 1.0);
            if ($fillOpacity <= 0 || $fillOpacity > 1) {
                throw PageOperationException::invalidAnnotationParams('fillOpacity must be greater than 0 and at most 1.');
            }
            $normalized['fillColor'] = $params['fillColor'];
            $normalized['fillOpacity'] = $fillOpacity;
        }

        return $normalized;
    }

    private function normalizeFreehandParams(array $params): array
    {
        $points = $params['points'] ?? [];
        if (! is_array($points) || count($points) < 2) {
            throw PageOperationException::invalidAnnotationParams('a freehand stroke requires at least 2 points.');
        }
        foreach ($points as $point) {
            if (! is_array($point) || ! isset($point['x'], $point['y'])) {
                throw PageOperationException::invalidAnnotationParams('each freehand point requires x and y.');
            }
        }

        $color = $params['color'] ?? '#FF0000';
        $this->assertHexColor($color);
        $thickness = (float) ($params['thickness'] ?? 2.0);
        if ($thickness <= 0 || $thickness > 40) {
            throw PageOperationException::invalidAnnotationParams('thickness must be a positive number (up to 40).');
        }

        return [
            'points' => array_map(fn (array $p) => ['x' => (float) $p['x'], 'y' => (float) $p['y']], array_values($points)),
            'color' => $color,
            'thickness' => $thickness,
            // A drawn signature is not a new annotation type — it's this same
            // freehand stroke, flagged so the frontend can render the
            // "visual mark, not a cryptographic signature" honesty note.
            'isSignature' => (bool) ($params['isSignature'] ?? false),
        ];
    }

    private function normalizeArrowParams(array $params): array
    {
        $color = $params['color'] ?? '#000000';
        $this->assertHexColor($color);
        $thickness = (float) ($params['thickness'] ?? 2.0);
        if ($thickness <= 0 || $thickness > 40) {
            throw PageOperationException::invalidAnnotationParams('thickness must be a positive number (up to 40).');
        }

        return ['color' => $color, 'thickness' => $thickness];
    }

    private function normalizeTextBoxParams(array $params): array
    {
        $text = trim((string) ($params['text'] ?? ''));
        if ($text === '') {
            throw PageOperationException::invalidAnnotationParams('text must not be empty.');
        }

        $font = $params['font'] ?? 'Helvetica';
        $resolvedFont = $font === 'Arial' ? 'Helvetica' : $font;
        if (! in_array($resolvedFont, PdfContentEngine::AVAILABLE_FONTS, true)) {
            throw PageOperationException::invalidFont($font);
        }

        $fontSize = (float) ($params['fontSize'] ?? 12);
        if ($fontSize <= 0 || $fontSize > 400) {
            throw PageOperationException::invalidAnnotationParams('fontSize must be a positive number (up to 400).');
        }

        $align = $params['align'] ?? 'left';
        if (! in_array($align, ['left', 'center', 'right', 'justify'], true)) {
            throw PageOperationException::invalidAnnotationParams("align must be one of left, center, right, justify (got '{$align}').");
        }

        $lineSpacing = (float) ($params['lineSpacing'] ?? 1.2);
        if ($lineSpacing <= 0 || $lineSpacing > 5) {
            throw PageOperationException::invalidAnnotationParams('lineSpacing must be a positive number (up to 5).');
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
        ];

        if (! empty($params['backgroundColor'])) {
            $this->assertHexColor($params['backgroundColor']);
            $normalized['backgroundColor'] = $params['backgroundColor'];
        }
        if (! empty($params['borderColor'])) {
            $this->assertHexColor($params['borderColor']);
            $normalized['borderColor'] = $params['borderColor'];
        }

        return $normalized;
    }

    private function normalizeStickyNoteParams(array $params): array
    {
        $note = trim((string) ($params['note'] ?? ''));
        $color = $params['color'] ?? '#FFD54A';
        $this->assertHexColor($color);

        return ['note' => $note, 'color' => $color];
    }

    private function normalizeStampParams(array $params, Document $document, ?UploadedFile $imageFile): array
    {
        $kind = $params['stampKind'] ?? ($imageFile ? 'image' : 'preset');

        if ($kind === 'image') {
            if (! $imageFile) {
                if (! isset($params['storagePath'])) {
                    throw PageOperationException::invalidImageSource();
                }

                return [
                    'stampKind' => 'image',
                    'storagePath' => $params['storagePath'],
                    'originalFilename' => $params['originalFilename'] ?? null,
                ];
            }

            // Same validate/normalize/store logic Phase 4's inserted images
            // use (real content sniff, GD re-encode to PNG) — see
            // ImageNormalizationService.
            $storagePath = $this->images->store($imageFile, $document, 'annotation-assets');

            return ['stampKind' => 'image', 'storagePath' => $storagePath, 'originalFilename' => $imageFile->getClientOriginalName()];
        }

        $presetKey = $params['presetKey'] ?? 'approved';
        if (! array_key_exists($presetKey, PdfAnnotationEngine::STAMP_PRESETS)) {
            throw PageOperationException::invalidAnnotationParams(
                "unknown stamp preset '{$presetKey}'. Available: ".implode(', ', array_keys(PdfAnnotationEngine::STAMP_PRESETS)).'.'
            );
        }

        return ['stampKind' => 'preset', 'presetKey' => $presetKey];
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

    private function assertPositiveSize(array $annotation): void
    {
        if ($annotation['width'] <= 0 || $annotation['height'] <= 0) {
            throw PageOperationException::invalidAnnotationParams('width and height must be positive.');
        }
    }

    /** Strips internal-only fields (e.g. a stamp image's disk storagePath) before returning params to the client. */
    private function publicParams(array $annotation): array
    {
        if ($annotation['type'] !== 'stamp' || ($annotation['params']['stampKind'] ?? null) !== 'image') {
            return $annotation['params'];
        }

        return [
            'stampKind' => 'image',
            'originalFilename' => $annotation['params']['originalFilename'] ?? null,
        ];
    }
}
