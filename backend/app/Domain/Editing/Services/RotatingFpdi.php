<?php

namespace App\Domain\Editing\Services;

use setasign\Fpdi\Fpdi;

/**
 * FPDI (which itself extends FPDF) has no built-in rotation primitive.
 * This adds the standard, well-known FPDF rotation technique (originally
 * published as an FPDF "script" — see fpdf.org's Rotation example): wrap
 * drawing calls in a PDF content-stream `q ... cm ... Q` block (save
 * graphics state, apply a rotation matrix around a pivot point, restore).
 * This is real PDF content-stream manipulation via the standard `cm`
 * (current transformation matrix) operator — not a raster trick.
 *
 * Usage: call Rotate($angle, $pivotX, $pivotY) *before* drawing (both in
 * this object's own top-left-origin coordinate space, same as SetXY),
 * draw normally, then call Rotate(0) to close the graphics state before
 * drawing anything else on the same page.
 */
class RotatingFpdi extends Fpdi
{
    protected float $rotationAngle = 0.0;

    public function Rotate(float $angle, float $x = -1, float $y = -1): void
    {
        if ($x === -1.0) {
            $x = $this->x;
        }
        if ($y === -1.0) {
            $y = $this->y;
        }

        if ($this->rotationAngle !== 0.0) {
            $this->_out('Q');
        }

        $this->rotationAngle = $angle;

        if ($angle !== 0.0) {
            $radians = $angle * M_PI / 180;
            $cos = cos($radians);
            $sin = sin($radians);
            $cx = $x * $this->k;
            $cy = ($this->h - $y) * $this->k;
            $this->_out(sprintf(
                'q %.5F %.5F %.5F %.5F %.2F %.2F cm 1 0 0 1 %.2F %.2F cm',
                $cos, $sin, -$sin, $cos, $cx, $cy, -$cx, -$cy
            ));
        }
    }

    /**
     * FPDF's `SetFont()` silently skips re-emitting the `Tf` (font
     * selection) operator whenever its internally cached family/style/size
     * already matches the request — a correct optimization for FPDF's own
     * normal, single continuous document flow, but wrong here: `Rotate()`'s
     * raw `q`/`Q` content-stream manipulation can revert the PDF graphics
     * state (which text-state parameters, including the selected font, are
     * part of — PDF spec §9.3) *underneath* FPDF's bookkeeping, which has
     * no way to know that happened. Without this reset, a second object
     * using the identical font/size as a previous one on the same page gets
     * NO font selected in its own text-showing operator, producing a real
     * corrupt PDF (caught via `pdftotext`: "Syntax Error: No font in
     * show" and the object's text missing from extraction entirely). Call
     * this immediately before every `SetFont()` in a per-object drawing
     * pass so each object's font selection is always freshly emitted
     * inside its own graphics-state bracket, never assumed carried over.
     */
    public function resetFontCache(): void
    {
        $this->FontFamily = '';
        $this->FontStyle = '';
        $this->FontSizePt = 0;
    }

    protected function _endpage(): void
    {
        if ($this->rotationAngle !== 0.0) {
            $this->rotationAngle = 0.0;
            $this->_out('Q');
        }
        parent::_endpage();
    }
}
