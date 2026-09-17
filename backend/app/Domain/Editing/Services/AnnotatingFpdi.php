<?php

namespace App\Domain\Editing\Services;

/**
 * Adds the two drawing primitives Phase 5's annotation engine needs that
 * neither base FPDF 1.9.0 nor FPDI 2.6.8 provide (confirmed by grepping
 * `vendor/setasign/fpdf/fpdf.php` for every drawing method — it has only
 * `Line()` and `Rect()`, no `Polygon`/`Ellipse`/`Circle`/`Curve`):
 *
 * 1. `drawPolyline()` — a raw PDF path built directly from `m`/`l`/`h`
 *    content-stream operators (the same "extend the class and call the
 *    inherited `_out()`" technique `RotatingFpdi::Rotate()` already uses
 *    for its own raw `cm` matrix operators). Unlike `Line()`/`Rect()`
 *    (which take TOP-LEFT-origin coordinates and flip them internally via
 *    `($this->h - $y) * $this->k`), this method takes points directly in
 *    OUR app's bottom-left-origin PDF-point convention and only multiplies
 *    by `$this->k` — because that convention already matches the PDF
 *    content stream's own native coordinate space (bottom-left-origin);
 *    `Line()`/`Rect()`'s flip exists purely to convert FROM their public
 *    top-left-facing API TO that same native space, a conversion we don't
 *    need here since we're emitting native-space operators directly. This
 *    single primitive serves freehand (open, stroke-only), circle/ellipse
 *    (closed polygon approximated from many parametric points — chosen
 *    over hand-rolled Bézier curve operators as the lower-risk, still
 *    visually indistinguishable option at real annotation sizes), and the
 *    arrow's small filled triangular head.
 *
 * 2. `SetAlpha()` — real alpha transparency (needed only by the
 *    "highlight" annotation: a translucent tint that still lets the
 *    underlying text show through, which is only achievable via partial
 *    opacity since FPDI's imported page template is always drawn first,
 *    with everything else layering on top in call order — never
 *    z-order-able "behind" the text). FPDF has no built-in alpha support;
 *    this is the standard, widely-published FPDF transparency recipe (an
 *    `/ExtGState` resource per alpha value, activated via the `gs`
 *    operator) — verified against this exact installed FPDF version's
 *    `_putresourcedict()`/`_putresources()`/`_newobj()` implementations
 *    (`vendor/setasign/fpdf/fpdf.php`) before writing this, rather than
 *    copied blind from a recipe written against a different version.
 */
class AnnotatingFpdi extends RotatingFpdi
{
    /** @var array<int, array{alpha: float, objNum?: int}> */
    private array $extGStates = [];

    /**
     * @param  list<array{x: float, y: float}>  $points  Bottom-left-origin PDF points, our app's native convention.
     * @param  array{0: int, 1: int, 2: int}  $strokeColor
     * @param  array{0: int, 1: int, 2: int}|null  $fillColor
     */
    public function drawPolyline(array $points, array $strokeColor, float $strokeWidth, bool $closed = false, ?array $fillColor = null): void
    {
        if (count($points) < 2) {
            return;
        }

        $this->SetDrawColor($strokeColor[0], $strokeColor[1], $strokeColor[2]);
        $this->SetLineWidth($strokeWidth);
        if ($fillColor !== null) {
            $this->SetFillColor($fillColor[0], $fillColor[1], $fillColor[2]);
        }

        $k = $this->k;
        $first = $points[0];
        $this->_out(sprintf('%.2F %.2F m', $first['x'] * $k, $first['y'] * $k));
        for ($i = 1; $i < count($points); $i++) {
            $this->_out(sprintf('%.2F %.2F l', $points[$i]['x'] * $k, $points[$i]['y'] * $k));
        }
        if ($closed) {
            $this->_out('h');
        }

        $this->_out(match (true) {
            $fillColor !== null && $closed => 'B',
            $fillColor !== null => 'f',
            default => 'S',
        });
    }

    /**
     * Applies a translucent (or fully opaque, for `$alpha = 1.0`) graphics
     * state to every stroking/filling operation until the next `SetAlpha()`
     * call — callers MUST call `SetAlpha(1.0)` after a translucent draw to
     * restore normal opacity for whatever draws next on the same page.
     */
    public function SetAlpha(float $alpha): void
    {
        $index = count($this->extGStates) + 1;
        $this->extGStates[$index] = ['alpha' => max(0.0, min(1.0, $alpha))];
        $this->_out('/GS'.$index.' gs');
    }

    protected function _putextgstates(): void
    {
        foreach ($this->extGStates as $i => $gs) {
            $this->_newobj();
            $this->extGStates[$i]['objNum'] = $this->n;
            $this->_put('<</Type /ExtGState');
            $this->_put(sprintf('/ca %.3F', $gs['alpha']));
            $this->_put(sprintf('/CA %.3F', $gs['alpha']));
            $this->_put('/BM /Normal');
            $this->_put('>>');
            $this->_put('endobj');
        }
    }

    protected function _putresourcedict(): void
    {
        parent::_putresourcedict();
        if ($this->extGStates !== []) {
            $this->_put('/ExtGState <<');
            foreach ($this->extGStates as $i => $gs) {
                $this->_put('/GS'.$i.' '.$gs['objNum'].' 0 R');
            }
            $this->_put('>>');
        }
    }

    protected function _putresources(): void
    {
        // Must run BEFORE parent::_putresources(), which reserves object
        // number 2 specifically for the resource dictionary via
        // `_newobj(2)` — our ExtGState objects need their own, separately
        // auto-numbered objects allocated first so `_putresourcedict()`
        // (called from inside the parent method) can reference their real
        // object numbers.
        $this->_putextgstates();
        parent::_putresources();
    }
}
