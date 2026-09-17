<?php

namespace App\Domain\Scanning\Services;

use Imagick;
use ImagickPixel;
use RuntimeException;

/**
 * Phase 6's cleanup engine. Every method takes a source path and NEVER
 * modifies it — always writes a brand-new file — so "do not destroy the
 * original images" holds structurally, not just by convention: there is
 * no code path here that opens a file for writing back to itself.
 *
 * Real ImageMagick (via the Imagick PHP extension — confirmed installed
 * and instantiable on the exact PHP binary this project's
 * `artisan serve`/`queue:work` actually run, see ARCHITECTURE.md's Phase
 * 6 section), not hand-rolled GD approximations: `deskewImage()` for real
 * skew correction, `despeckleImage()`/a light blur pass for noise
 * reduction, `sharpenImage()`, `brightnessContrastImage()` for tone.
 */
class ScanImageProcessor
{
    public function __construct()
    {
        if (! class_exists(Imagick::class)) {
            throw new RuntimeException('The Imagick PHP extension is required for scan image processing but is not available.');
        }
    }

    /**
     * @param  array{rotationDegrees?: float, deskew?: bool, crop?: array{x: float, y: float, width: float, height: float}, brightness?: float, contrast?: float, sharpen?: float, noiseReduction?: float, backgroundCleanup?: bool}  $params
     */
    public function process(string $sourcePath, array $params, string $outputPath): void
    {
        $img = new Imagick($sourcePath);
        $img->autoOrient(); // real EXIF orientation, not a guess
        $img->setImageBackgroundColor(new ImagickPixel('white'));

        $rotation = (float) ($params['rotationDegrees'] ?? 0);
        if ($rotation !== 0.0) {
            $img->rotateImage(new ImagickPixel('white'), $rotation);
        }

        if (! empty($params['deskew'])) {
            // Threshold is a fraction of QuantumRange; 40% is ImageMagick's
            // own commonly-recommended starting point for real scanned
            // documents (verified against a real deliberately-skewed test
            // image during this phase's own testing, see ARCHITECTURE.md).
            $img->deskewImage(0.4 * Imagick::getQuantumRange()['quantumRangeLong']);
            // deskewImage composites onto a larger canvas to fit the
            // rotated result — flatten back onto the white background and
            // reset the virtual-canvas offset it leaves behind, or a crop
            // box drawn against the deskewed preview would be measured
            // from the wrong origin.
            $img->setImagePage(0, 0, 0, 0);
            $img = $img->flattenImages();
        }

        if (! empty($params['crop']) && is_array($params['crop'])) {
            $c = $params['crop'];
            $img->cropImage(
                max(1, (int) $c['width']),
                max(1, (int) $c['height']),
                (int) $c['x'],
                (int) $c['y'],
            );
            $img->setImagePage(0, 0, 0, 0);
        }

        $brightness = (float) ($params['brightness'] ?? 0);
        $contrast = (float) ($params['contrast'] ?? 0);
        if ($brightness !== 0.0 || $contrast !== 0.0) {
            $img->brightnessContrastImage($brightness, $contrast);
        }

        $sharpen = (float) ($params['sharpen'] ?? 0);
        if ($sharpen > 0) {
            $img->sharpenImage(0, max(0.1, $sharpen / 20));
        }

        $noiseReduction = (float) ($params['noiseReduction'] ?? 0);
        if ($noiseReduction > 0) {
            // despeckleImage is a fixed-strength pass; repeat it for a
            // real (if coarse) "strength" knob rather than faking one.
            $passes = (int) ceil($noiseReduction / 34); // 1-3 passes across a 0-100 range
            for ($i = 0; $i < $passes; $i++) {
                $img->despeckleImage();
            }
        }

        if (! empty($params['backgroundCleanup'])) {
            $img->normalizeImage();
            $img->whiteThresholdImage(new ImagickPixel('#F2F2F2'));
        }

        $img->setImageFormat('png');
        $img->writeImage($outputPath);
        $img->clear();
        $img->destroy();
    }

    /** Real pixel dimensions after EXIF auto-orientation (never trust the raw file's own header alone). */
    public function dimensions(string $sourcePath): array
    {
        $img = new Imagick($sourcePath);
        $img->autoOrient();
        $result = ['width' => $img->getImageWidth(), 'height' => $img->getImageHeight()];
        $img->clear();
        $img->destroy();

        return $result;
    }

    /**
     * A genuinely-blank (or near-blank) page has a grayscale mean very
     * close to white and almost no variation. This is a suggestion
     * surfaced to the user, never an automatic exclusion — see
     * ScanSessionService.
     */
    public function isLikelyBlank(string $sourcePath): bool
    {
        $img = new Imagick($sourcePath);
        $img->autoOrient();
        $img->transformImageColorspace(Imagick::COLORSPACE_GRAY);
        $stats = $img->getImageChannelStatistics();
        $gray = $stats[Imagick::CHANNEL_GRAY] ?? null;
        $img->clear();
        $img->destroy();

        if (! $gray) {
            return false;
        }

        $quantumRange = Imagick::getQuantumRange()['quantumRangeLong'];
        $meanFraction = $gray['mean'] / $quantumRange;
        $stddevFraction = $gray['standardDeviation'] / $quantumRange;

        // Verified against a real deliberately-blank test page during
        // this phase's own testing (see ARCHITECTURE.md) — a normal
        // scanned page of text has far more variation than this.
        return $meanFraction > 0.92 && $stddevFraction < 0.05;
    }
}
