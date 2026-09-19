<?php

namespace App\Domain\Editing\Services;

use App\Exceptions\PageOperationException;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Storage;

/**
 * Phase 4's engine: composes real new PDF content on top of an existing
 * PDF's real, unmodified pages, via `setasign/fpdi` + `setasign/fpdf` (both
 * free/open-source — no commercial licensing needed). FPDI imports each
 * existing page as a template (its real content, untouched); FPDF draws new
 * text/images on top with real font/size/style/color/position parameters.
 * The result is genuinely new PDF content — real, selectable, extractable
 * text when using a core font, not a rasterized picture of text.
 *
 * Recomposition model (see ContentObjectService for the full picture): this
 * engine always rebuilds EVERY page of the source file from scratch, in one
 * pass, drawing the full *currently active* set of content objects for each
 * page. It never draws on top of a file that already has a previous object
 * state baked in — that would double-draw/ghost. The caller is responsible
 * for always passing a "clean" source (a page-structure state with no
 * content objects of its own yet) plus the complete current object list.
 *
 * Coordinate convention: objects use bottom-left-origin PDF points, the
 * same convention Phase 3's crop feature already established. FPDF/FPDI
 * use top-left-origin internally; this engine does the conversion once,
 * centrally, so no other code needs to know about it.
 */
class PdfContentEngine
{
    /**
     * FPDF's three built-in core fonts (no embedding rights/licensing
     * concerns) plus 'Pacifico', a real OFL-licensed cursive TrueType font
     * bundled at resources/fonts/signature and genuinely embedded/subsetted
     * via AddFont() below — verified with pdffonts (emb: yes, sub: yes,
     * uni: yes), not a raster fallback. 'Arial' is accepted as a common
     * alias for Helvetica.
     */
    public const AVAILABLE_FONTS = ['Helvetica', 'Times', 'Courier', 'Pacifico'];

    private const FONT_ALIASES = ['Arial' => 'Helvetica'];

    /** Pacifico ships as a single regular weight — bold/italic have no real embedded variant, so callers must not request a style for it. */
    private const SIGNATURE_FONT_DIR = __DIR__.'/../../../../resources/fonts/signature';

    /**
     * @param  array<int, list<array{objectId: string, type: string, x: float, y: float, width: float, height: float, rotation: float, zIndex: int, active: bool, params: array}>>  $objectsByPage
     *                                                                                                                                                                                              Keyed by 1-based page number. Only `active === true` entries are drawn; inactive (soft-deleted) entries are ignored here but kept in the caller's stored array so undo/redo can resurrect them for free by pointing at an older step.
     */
    public function compose(string $sourcePath, string $outputPath, array $objectsByPage): void
    {
        $pdf = new RotatingFpdi('P', 'pt');
        // We do manual absolute-position placement on pre-existing pages,
        // never flowing text layout — FPDF's automatic page-break (default
        // ON) would otherwise silently insert an extra blank page mid-
        // MultiCell() whenever a text box's computed position was close to
        // the page's bottom margin, corrupting the page count and, since it
        // fires *between* our raw Rotate() q/Q content-stream operators,
        // leaving an unbalanced graphics state that produced a real corrupt
        // PDF (caught via `pdftotext`: "Syntax Error: No font in show").
        $pdf->SetAutoPageBreak(false);
        $pdf->SetMargins(0, 0, 0);
        // AddFont()'s 3rd arg must be a bare filename (no slashes) — FPDF
        // rejects any path separator in it — with the directory passed
        // separately as the 4th arg. Registered once per document; FPDF
        // caches by family+style internally so re-registering per object
        // would be wasteful, not just redundant.
        $pdf->AddFont('Pacifico', '', 'Pacifico-Regular.json', self::SIGNATURE_FONT_DIR);

        try {
            $pageCount = $pdf->setSourceFile($this->flattenFormFieldsIfPresent($sourcePath, dirname($outputPath)));
        } catch (\Throwable $e) {
            throw PageOperationException::processingFailed('could not read the source PDF for content editing: '.$e->getMessage());
        }

        for ($page = 1; $page <= $pageCount; $page++) {
            $templateId = $pdf->importPage($page);
            $size = $pdf->getTemplateSize($templateId);

            $pdf->AddPage($size['orientation'], [$size['width'], $size['height']]);
            $pdf->useTemplate($templateId, 0, 0, $size['width'], $size['height']);

            $objects = $objectsByPage[$page] ?? [];
            usort($objects, fn (array $a, array $b) => $a['zIndex'] <=> $b['zIndex']);

            foreach ($objects as $object) {
                if (! ($object['active'] ?? true)) {
                    continue;
                }
                $this->drawObject($pdf, $size['height'], $object);
            }
            $pdf->Rotate(0); // close any rotation graphics state left open by the last object on this page
        }

        $bytes = $pdf->Output('S');
        if (@file_put_contents($outputPath, $bytes) === false) {
            throw PageOperationException::processingFailed('could not write the composed PDF.');
        }
    }

    /**
     * Phase 15 integration-testing finding: if `$sourcePath` is the Forms
     * chain's current output, it has real AcroForm field widgets living in
     * each page's `/Annots` array with their visual appearance in a
     * separate `/AP` stream (see FormFieldEngine's docblock). FPDI's
     * `importPage()` below only imports a page's content stream — it never
     * carries `/Annots` — so switching from Forms to this chain silently
     * dropped form fields entirely, both interactively AND visually,
     * unlike every other object type here (which draws as real
     * content-stream operators FPDI happily imports). Flattening the
     * source through `pdftk` first bakes each field's existing appearance
     * into real page content before FPDI ever sees it, matching the same
     * "other domains' output becomes an inert flat base" convention this
     * engine already applies to Content/Annotation objects. A cheap
     * `dump_data_fields` probe skips this entirely for the overwhelmingly
     * common case (a source with no form fields at all); any pdftk failure
     * falls back to the original path rather than failing the whole
     * compose over a cosmetic-preservation step.
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

    private function drawObject(RotatingFpdi $pdf, float $pageHeightPt, array $object): void
    {
        // Bottom-left-origin (our convention) -> top-left-origin (FPDF's convention).
        $topY = $pageHeightPt - $object['y'] - $object['height'];
        $centerX = $object['x'] + $object['width'] / 2;
        $centerY = $topY + $object['height'] / 2;

        $pdf->Rotate((float) ($object['rotation'] ?? 0), $centerX, $centerY);

        match ($object['type']) {
            'text', 'text_overlay_edit' => $this->drawText($pdf, $object, $pageHeightPt, $topY),
            'image' => $this->drawImage($pdf, $object, $topY),
            default => throw PageOperationException::processingFailed("unknown content object type '{$object['type']}'."),
        };
    }

    private function drawText(RotatingFpdi $pdf, array $object, float $pageHeightPt, float $topY): void
    {
        $params = $object['params'];

        if ($object['type'] === 'text_overlay_edit' && ! empty($params['coverOriginal'])) {
            // coverOriginal is in the SAME bottom-left-origin coordinate space
            // as the object box, but sized/positioned independently (the
            // redaction rectangle need not exactly equal the new text box).
            $cover = $params['coverOriginal'];
            [$cr, $cg, $cb] = $this->colorFromHex($params['coverColor'] ?? '#FFFFFF');
            $coverTop = $pageHeightPt - (float) $cover['y'] - (float) $cover['height'];
            $pdf->SetFillColor($cr, $cg, $cb);
            $pdf->Rect((float) $cover['x'], $coverTop, (float) $cover['width'], (float) $cover['height'], 'F');
        }

        $font = self::FONT_ALIASES[$params['font']] ?? $params['font'];
        // Pacifico is bundled as a single regular weight only — no bold/italic
        // variant is embedded, so a style flag here would make FPDF throw
        // "Undefined font" instead of silently substituting a core font.
        $style = $font === 'Pacifico'
            ? ''
            : ($params['bold'] ?? false ? 'B' : '').($params['italic'] ?? false ? 'I' : '');
        $fontSize = (float) $params['fontSize'];
        [$r, $g, $b] = $this->colorFromHex($params['color'] ?? '#000000');
        $align = match ($params['align'] ?? 'left') {
            'center' => 'C',
            'right' => 'R',
            'justify' => 'J',
            default => 'L',
        };
        $lineHeight = $fontSize * (float) ($params['lineSpacing'] ?? 1.2);

        $pdf->resetFontCache(); // see RotatingFpdi::resetFontCache() — required because of the raw q/Q rotation wrapping above
        $pdf->SetFont($font, $style, $fontSize);
        $pdf->SetTextColor($r, $g, $b);
        $pdf->SetXY($object['x'], $topY);
        $pdf->MultiCell($object['width'], $lineHeight, (string) $params['text'], 0, $align);
    }

    private function drawImage(RotatingFpdi $pdf, array $object, float $topY): void
    {
        $storagePath = $object['params']['storagePath'] ?? null;
        $absolutePath = $storagePath ? Storage::disk('documents')->path($storagePath) : null;
        if (! $absolutePath || ! is_file($absolutePath)) {
            throw PageOperationException::processingFailed('an inserted image is missing from storage.');
        }

        // Every inserted image is normalized to PNG at upload time (see
        // ContentObjectService::storeImage), so the format is always known.
        $pdf->Image($absolutePath, $object['x'], $topY, $object['width'], $object['height'], 'PNG');
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
