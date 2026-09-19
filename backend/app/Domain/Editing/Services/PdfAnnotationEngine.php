<?php

namespace App\Domain\Editing\Services;

use App\Exceptions\PageOperationException;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Storage;

/**
 * Phase 5's engine: composes real annotation marks on top of an existing
 * PDF's real, unmodified pages — the exact same FPDI-template-then-FPDF-
 * draw-on-top technique `PdfContentEngine` (Phase 4) established, reused
 * here for a second, independent kind of drawn content. See
 * `AnnotationService` for the full recomposition-chain picture (identical
 * to `ContentObjectService`'s, with its own separate `annotation_*`-typed
 * chain) and `AnnotatingFpdi` for the two new drawing primitives
 * (`drawPolyline`, `SetAlpha`) neither FPDF nor FPDI provide natively.
 *
 * HONEST SCOPE BOUNDARY:
 *  - Highlight/underline/strikethrough/freehand/rectangle/circle/arrow are
 *    real drawn marks, genuinely part of the page content — verified via
 *    real render + `qpdf --check`, not a client-side-only visual layer.
 *  - "Text box" is real, extractable PDF text (same technique as Phase 4's
 *    "add text"), with an optional real background/border box.
 *  - "Sticky note" draws a real, visible marker glyph, but the comment
 *    text itself is intentionally NEVER rendered onto the page — a static
 *    PDF has no built-in "hover popup" affordance the way a real PDF
 *    `/Annot` Text (sticky-note) dictionary gets in a generic viewer like
 *    Adobe Reader, and this engine only ever bakes visual content (the
 *    same honest boundary Phase 4 drew around "edit text"). The note's
 *    text is stored and only ever shown/edited within TeamO's own Smart
 *    Inspector — not a fake feature, an explicitly scoped one.
 *  - "Stamp" is a TRUE new embedded image (image variant, reusing the
 *    exact Phase 4 `Image()` technique) or a real drawn bordered-box +
 *    bold-text badge (preset variant) — never a placeholder graphic.
 */
class PdfAnnotationEngine
{
    /** @var array<string, array{label: string, color: string}> */
    public const STAMP_PRESETS = [
        'approved' => ['label' => 'APPROVED', 'color' => '#16A34A'],
        'rejected' => ['label' => 'REJECTED', 'color' => '#DC2626'],
        'draft' => ['label' => 'DRAFT', 'color' => '#6B7280'],
        'confidential' => ['label' => 'CONFIDENTIAL', 'color' => '#B91C1C'],
    ];

    /**
     * @param  array<int, list<array{annotationId: string, type: string, x: float, y: float, width: float, height: float, rotation: float, zIndex: int, active: bool, x2?: float, y2?: float, params: array}>>  $annotationsByPage
     *                                                                                                                                                                                                                              Keyed by 1-based page number. Only `active === true` entries are drawn.
     */
    public function compose(string $sourcePath, string $outputPath, array $annotationsByPage): void
    {
        $pdf = new AnnotatingFpdi('P', 'pt');
        // Same reasoning as PdfContentEngine::compose(): manual absolute-
        // position placement on pre-existing pages, never flowing text
        // layout, so FPDF's default auto page-break must stay off.
        $pdf->SetAutoPageBreak(false);
        $pdf->SetMargins(0, 0, 0);

        try {
            $pageCount = $pdf->setSourceFile($this->flattenFormFieldsIfPresent($sourcePath, dirname($outputPath)));
        } catch (\Throwable $e) {
            throw PageOperationException::processingFailed('could not read the source PDF for annotation composing: '.$e->getMessage());
        }

        for ($page = 1; $page <= $pageCount; $page++) {
            $templateId = $pdf->importPage($page);
            $size = $pdf->getTemplateSize($templateId);

            $pdf->AddPage($size['orientation'], [$size['width'], $size['height']]);
            $pdf->useTemplate($templateId, 0, 0, $size['width'], $size['height']);

            $annotations = $annotationsByPage[$page] ?? [];
            usort($annotations, fn (array $a, array $b) => $a['zIndex'] <=> $b['zIndex']);

            foreach ($annotations as $annotation) {
                if (! ($annotation['active'] ?? true)) {
                    continue;
                }
                $this->drawAnnotation($pdf, $size['height'], $annotation);
            }
            $pdf->Rotate(0); // close any rotation graphics state left open by the last annotation on this page
        }

        $bytes = $pdf->Output('S');
        if (@file_put_contents($outputPath, $bytes) === false) {
            throw PageOperationException::processingFailed('could not write the annotated PDF.');
        }
    }

    /**
     * See `PdfContentEngine::flattenFormFieldsIfPresent()` — identical
     * Phase 15 finding and fix: FPDI's `importPage()` below never carries a
     * page's `/Annots`, which is where AcroForm field widgets (and their
     * `/AP` visual appearance) live, so switching from Forms to this chain
     * silently dropped fields entirely. Flattening first bakes their
     * appearance into real content before FPDI ever sees it.
     */
    private function flattenFormFieldsIfPresent(string $sourcePath, string $scratchDir): string
    {
        $probe = Process::timeout(15)->run(['pdftk', $sourcePath, 'dump_data_fields']);
        if (! $probe->successful() || trim($probe->output()) === '') {
            return $sourcePath;
        }

        $flattened = $scratchDir.'/flattened-source.pdf';
        $result = Process::timeout(30)->run(['pdftk', $sourcePath, 'output', $flattened, 'flatten']);
        if (! $result->successful() || ! is_file($flattened)) {
            return $sourcePath;
        }

        return $flattened;
    }

    private function drawAnnotation(AnnotatingFpdi $pdf, float $pageHeightPt, array $object): void
    {
        $type = $object['type'];

        // Arrow's own two-point (x2,y2) direction already fully determines
        // its visual orientation — wrapping it in the generic box-rotation
        // too would be redundant and confusing, so it alone skips the
        // Rotate() bracket every other type gets.
        if ($type !== 'arrow') {
            $topY = $pageHeightPt - $object['y'] - $object['height'];
            $centerX = $object['x'] + $object['width'] / 2;
            $centerY = $topY + $object['height'] / 2;
            $pdf->Rotate((float) ($object['rotation'] ?? 0), $centerX, $centerY);
        }

        match ($type) {
            'highlight', 'underline', 'strikethrough' => $this->drawMark($pdf, $object, $pageHeightPt),
            'rectangle', 'circle' => $this->drawShape($pdf, $object, $pageHeightPt),
            'freehand' => $this->drawFreehand($pdf, $object),
            'arrow' => $this->drawArrow($pdf, $object),
            'text_box' => $this->drawTextBox($pdf, $object, $pageHeightPt),
            'sticky_note' => $this->drawStickyNote($pdf, $object),
            'stamp' => $this->drawStamp($pdf, $object, $pageHeightPt),
            default => throw PageOperationException::processingFailed("unknown annotation type '{$type}'."),
        };
    }

    /** Highlight (translucent tint), underline, strikethrough. */
    private function drawMark(AnnotatingFpdi $pdf, array $object, float $pageHeightPt): void
    {
        $params = $object['params'];
        [$r, $g, $b] = $this->colorFromHex($params['color'] ?? '#FFFF00');

        if ($object['type'] === 'highlight') {
            $topY = $pageHeightPt - $object['y'] - $object['height'];
            $opacity = (float) ($params['opacity'] ?? 0.4);
            $pdf->SetFillColor($r, $g, $b);
            $pdf->SetAlpha($opacity);
            $pdf->Rect($object['x'], $topY, $object['width'], $object['height'], 'F');
            $pdf->SetAlpha(1.0); // restore full opacity for whatever draws next on this page

            return;
        }

        $thickness = (float) ($params['thickness'] ?? 1.5);
        // Bottom-left-origin y for the mark's own vertical position within
        // the box, converted to Line()'s expected top-left-origin form.
        $markY = $object['type'] === 'underline'
            ? $object['y'] + $thickness
            : $object['y'] + $object['height'] / 2;
        $topLineY = $pageHeightPt - $markY;

        $pdf->SetDrawColor($r, $g, $b);
        $pdf->SetLineWidth($thickness);
        $pdf->Line($object['x'], $topLineY, $object['x'] + $object['width'], $topLineY);
    }

    /** Rectangle (native `Rect()`) and circle/ellipse (polygon approximation via `drawPolyline`). */
    private function drawShape(AnnotatingFpdi $pdf, array $object, float $pageHeightPt): void
    {
        $params = $object['params'];
        [$sr, $sg, $sb] = $this->colorFromHex($params['strokeColor'] ?? '#000000');
        $strokeWidth = (float) ($params['strokeWidth'] ?? 1.5);
        $hasFill = ! empty($params['fillColor']);
        $fillOpacity = $hasFill ? (float) ($params['fillOpacity'] ?? 1.0) : 1.0;

        if ($object['type'] === 'rectangle') {
            $topY = $pageHeightPt - $object['y'] - $object['height'];
            $pdf->SetDrawColor($sr, $sg, $sb);
            $pdf->SetLineWidth($strokeWidth);
            $style = 'S';
            if ($hasFill) {
                [$fr, $fg, $fb] = $this->colorFromHex($params['fillColor']);
                $pdf->SetFillColor($fr, $fg, $fb);
                if ($fillOpacity < 1.0) {
                    $pdf->SetAlpha($fillOpacity);
                }
                $style = 'DF';
            }
            $pdf->Rect($object['x'], $topY, $object['width'], $object['height'], $style);
            if ($hasFill && $fillOpacity < 1.0) {
                $pdf->SetAlpha(1.0);
            }

            return;
        }

        // circle/ellipse: a 48-point polygon approximation, drawn directly
        // in native bottom-left-origin coordinates via drawPolyline — see
        // AnnotatingFpdi's docblock for why this needs no top-left flip.
        $centerX = $object['x'] + $object['width'] / 2;
        $centerY = $object['y'] + $object['height'] / 2;
        $rx = $object['width'] / 2;
        $ry = $object['height'] / 2;
        $segments = 48;
        $points = [];
        for ($i = 0; $i < $segments; $i++) {
            $angle = 2 * M_PI * $i / $segments;
            $points[] = ['x' => $centerX + $rx * cos($angle), 'y' => $centerY + $ry * sin($angle)];
        }

        $fillRgb = null;
        if ($hasFill) {
            $fillRgb = $this->colorFromHex($params['fillColor']);
            if ($fillOpacity < 1.0) {
                $pdf->SetAlpha($fillOpacity);
            }
        }
        $pdf->drawPolyline($points, [$sr, $sg, $sb], $strokeWidth, true, $fillRgb);
        if ($hasFill && $fillOpacity < 1.0) {
            $pdf->SetAlpha(1.0);
        }
    }

    /** One continuous freehand stroke — a raw, unfilled polyline through the stored points. */
    private function drawFreehand(AnnotatingFpdi $pdf, array $object): void
    {
        $params = $object['params'];
        [$r, $g, $b] = $this->colorFromHex($params['color'] ?? '#FF0000');
        $thickness = (float) ($params['thickness'] ?? 2.0);
        $points = array_map(
            fn (array $p) => ['x' => (float) $p['x'], 'y' => (float) $p['y']],
            $params['points'] ?? [],
        );

        $pdf->drawPolyline($points, [$r, $g, $b], $thickness);
    }

    /** Shaft (a 2-point polyline) plus a small filled triangular head, angled from the shaft direction. */
    private function drawArrow(AnnotatingFpdi $pdf, array $object): void
    {
        $params = $object['params'];
        [$r, $g, $b] = $this->colorFromHex($params['color'] ?? '#000000');
        $thickness = (float) ($params['thickness'] ?? 2.0);

        $fromX = (float) $object['x'];
        $fromY = (float) $object['y'];
        $toX = (float) ($object['x2'] ?? $object['x'] + $object['width']);
        $toY = (float) ($object['y2'] ?? $object['y'] + $object['height']);

        $pdf->drawPolyline(
            [['x' => $fromX, 'y' => $fromY], ['x' => $toX, 'y' => $toY]],
            [$r, $g, $b],
            $thickness,
        );

        $angle = atan2($toY - $fromY, $toX - $fromX);
        $headLength = max(8.0, $thickness * 4);
        $headWidth = max(5.0, $thickness * 2.5);
        $backX = $toX - $headLength * cos($angle);
        $backY = $toY - $headLength * sin($angle);

        $pdf->drawPolyline([
            ['x' => $toX, 'y' => $toY],
            ['x' => $backX + $headWidth * cos($angle + M_PI / 2), 'y' => $backY + $headWidth * sin($angle + M_PI / 2)],
            ['x' => $backX + $headWidth * cos($angle - M_PI / 2), 'y' => $backY + $headWidth * sin($angle - M_PI / 2)],
        ], [$r, $g, $b], $thickness, true, [$r, $g, $b]);
    }

    /** Real, extractable PDF text plus an optional real background/border box — same text technique as PdfContentEngine::drawText(). */
    private function drawTextBox(AnnotatingFpdi $pdf, array $object, float $pageHeightPt): void
    {
        $params = $object['params'];
        $topY = $pageHeightPt - $object['y'] - $object['height'];

        if (! empty($params['backgroundColor'])) {
            [$br, $bg, $bb] = $this->colorFromHex($params['backgroundColor']);
            $pdf->SetFillColor($br, $bg, $bb);
            $pdf->Rect($object['x'], $topY, $object['width'], $object['height'], 'F');
        }
        if (! empty($params['borderColor'])) {
            [$or, $og, $ob] = $this->colorFromHex($params['borderColor']);
            $pdf->SetDrawColor($or, $og, $ob);
            $pdf->SetLineWidth(1.0);
            $pdf->Rect($object['x'], $topY, $object['width'], $object['height'], 'D');
        }

        $font = $params['font'] === 'Arial' ? 'Helvetica' : $params['font'];
        $style = ($params['bold'] ?? false ? 'B' : '').($params['italic'] ?? false ? 'I' : '');
        $fontSize = (float) $params['fontSize'];
        [$tr, $tg, $tb] = $this->colorFromHex($params['color'] ?? '#000000');
        $align = match ($params['align'] ?? 'left') {
            'center' => 'C',
            'right' => 'R',
            'justify' => 'J',
            default => 'L',
        };
        $lineHeight = $fontSize * (float) ($params['lineSpacing'] ?? 1.2);

        $pdf->resetFontCache();
        $pdf->SetFont($font, $style, $fontSize);
        $pdf->SetTextColor($tr, $tg, $tb);
        $pdf->SetXY($object['x'], $topY);
        $pdf->MultiCell($object['width'], $lineHeight, (string) $params['text'], 0, $align);
    }

    /**
     * A real, visible folded-corner marker glyph. The note's comment text
     * is deliberately NOT drawn here — see this class's docblock's honest
     * scope boundary.
     */
    private function drawStickyNote(AnnotatingFpdi $pdf, array $object): void
    {
        $params = $object['params'];
        [$r, $g, $b] = $this->colorFromHex($params['color'] ?? '#FFD54A');

        $x = $object['x'];
        $y = $object['y'];
        $w = $object['width'];
        $h = $object['height'];
        $fold = min($w, $h) * 0.3;

        $points = [
            ['x' => $x, 'y' => $y],
            ['x' => $x + $w, 'y' => $y],
            ['x' => $x + $w, 'y' => $y + $h - $fold],
            ['x' => $x + $w - $fold, 'y' => $y + $h],
            ['x' => $x, 'y' => $y + $h],
        ];
        $pdf->drawPolyline($points, [$r, $g, $b], 1.0, true, [$r, $g, $b]);
    }

    private function drawStamp(AnnotatingFpdi $pdf, array $object, float $pageHeightPt): void
    {
        $params = $object['params'];
        $topY = $pageHeightPt - $object['y'] - $object['height'];

        if (($params['stampKind'] ?? 'preset') === 'image') {
            $storagePath = $params['storagePath'] ?? null;
            $absolutePath = $storagePath ? Storage::disk('documents')->path($storagePath) : null;
            if (! $absolutePath || ! is_file($absolutePath)) {
                throw PageOperationException::processingFailed('a stamp image is missing from storage.');
            }
            // Every stamp image is normalized to PNG at upload time (see
            // ImageNormalizationService), same as Phase 4's inserted images.
            $pdf->Image($absolutePath, $object['x'], $topY, $object['width'], $object['height'], 'PNG');

            return;
        }

        $presetKey = $params['presetKey'] ?? 'approved';
        $preset = self::STAMP_PRESETS[$presetKey] ?? self::STAMP_PRESETS['approved'];
        [$r, $g, $b] = $this->colorFromHex($preset['color']);

        $pdf->SetDrawColor($r, $g, $b);
        $pdf->SetLineWidth(2.0);
        $pdf->Rect($object['x'], $topY, $object['width'], $object['height'], 'D');

        $fontSize = max(10.0, $object['height'] * 0.35);
        $pdf->resetFontCache();
        $pdf->SetFont('Helvetica', 'B', $fontSize);
        $pdf->SetTextColor($r, $g, $b);
        $pdf->SetXY($object['x'], $topY + $object['height'] / 2 - $fontSize / 2);
        $pdf->MultiCell($object['width'], $fontSize, $preset['label'], 0, 'C');
    }

    /** @return array{0: int, 1: int, 2: int} */
    private function colorFromHex(string $hex): array
    {
        $hex = ltrim($hex, '#');
        if (strlen($hex) === 3) {
            $hex = $hex[0].$hex[0].$hex[1].$hex[1].$hex[2].$hex[2];
        }
        if (! preg_match('/^[0-9a-fA-F]{6}$/', $hex)) {
            throw PageOperationException::invalidColor($hex);
        }

        return [
            hexdec(substr($hex, 0, 2)),
            hexdec(substr($hex, 2, 2)),
            hexdec(substr($hex, 4, 2)),
        ];
    }
}
