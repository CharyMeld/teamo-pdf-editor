<?php

namespace App\Domain\Scanning\Services;

use App\Domain\Editing\Services\WorkingCopyManager;
use App\Exceptions\ScanException;
use App\Models\ScanSession;
use App\Models\ScanSessionImage;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Phase 6 (scanning/image-import): manages a `ScanSession`'s images
 * BEFORE any `Document` exists — the SCAN/IMPORT → REVIEW → CLEAN →
 * REORDER half of the brief's flow (CREATE PDF is `ImagesToPdfService`).
 *
 * NON-DESTRUCTIVE BY CONSTRUCTION — mirrors Phase 4/5's "never touch the
 * clean source" principle: `addImages()` stores the EXACT uploaded bytes,
 * unmodified, at `original_storage_path` on the durable `documents` disk
 * (never `temp`, which is documented as swept/transient). Every cleanup
 * adjustment (`updateImageParams()`) only ever changes the `params` JSON
 * column — no code path here ever opens `original_storage_path` for
 * writing. `ScanImageProcessor` (injected) always writes a NEW file when
 * asked to render a preview or a final page; this service never asks it
 * to overwrite the source.
 */
class ScanSessionService
{
    private const ACCEPTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/tiff'];

    public function __construct(
        private readonly ScanImageProcessor $processor,
        private readonly WorkingCopyManager $working,
    ) {}

    public function createSession(User $user): ScanSession
    {
        return ScanSession::create([
            'uuid' => (string) Str::uuid(),
            'user_id' => $user->id,
            'status' => 'draft',
        ]);
    }

    public static function defaultParams(): array
    {
        return [
            'rotationDegrees' => 0,
            'deskew' => false,
            'crop' => null,
            'brightness' => 0,
            'contrast' => 0,
            'sharpen' => 0,
            'noiseReduction' => 0,
            'backgroundCleanup' => false,
            'excluded' => false,
        ];
    }

    /**
     * @param  list<UploadedFile>  $files
     * @return list<ScanSessionImage>
     */
    public function addImages(ScanSession $session, array $files): array
    {
        $nextPosition = 1 + (int) ($session->images()->max('position') ?? -1);

        $created = [];
        foreach ($files as $file) {
            $this->assertRealImage($file);

            $ext = strtolower($file->getClientOriginalExtension()) ?: 'bin';
            $storagePath = "scan-sessions/{$session->uuid}/source/".Str::uuid().".{$ext}";
            // The exact uploaded bytes, unmodified — the pristine original
            // this whole service is built around never touching again.
            Storage::disk('documents')->put($storagePath, file_get_contents($file->getRealPath()));
            $absolutePath = Storage::disk('documents')->path($storagePath);

            $dimensions = $this->processor->dimensions($absolutePath);

            $image = ScanSessionImage::create([
                'scan_session_id' => $session->id,
                'position' => $nextPosition++,
                'original_storage_path' => $storagePath,
                'original_filename' => $file->getClientOriginalName(),
                'original_width_px' => $dimensions['width'],
                'original_height_px' => $dimensions['height'],
                'params' => self::defaultParams(),
                // A suggestion only, computed once — see ScanImageProcessor's
                // own docblock. Never auto-excludes anything.
                'blank_page_detected' => $this->processor->isLikelyBlank($absolutePath),
            ]);
            $created[] = $image;
        }

        return $created;
    }

    public function updateImageParams(ScanSessionImage $image, array $changes): ScanSessionImage
    {
        $normalized = $this->normalizeParamChanges($changes, $image);
        $image->update(['params' => array_merge($image->params, $normalized)]);

        return $image->fresh();
    }

    /** @param  list<int>  $orderedImageIds */
    public function reorderImages(ScanSession $session, array $orderedImageIds): void
    {
        $current = $session->images()->pluck('id')->sort()->values()->all();
        $given = collect($orderedImageIds)->sort()->values()->all();
        if ($current !== $given) {
            throw ScanException::invalidReorder();
        }

        foreach ($orderedImageIds as $position => $imageId) {
            ScanSessionImage::where('id', $imageId)
                ->where('scan_session_id', $session->id)
                ->update(['position' => $position]);
        }
    }

    /** A hard delete — the user explicitly asked to drop this image from the batch entirely, distinct from `excluded` (soft, keeps the file, just skips it at Create PDF). */
    public function removeImage(ScanSessionImage $image): void
    {
        Storage::disk('documents')->delete($image->original_storage_path);
        $image->delete();
    }

    /** Renders the image's CURRENT processed state to a scratch file for preview — caller is responsible for cleaning it up via WorkingCopyManager. */
    public function renderPreview(ScanSessionImage $image, string $scratchDir): string
    {
        $absoluteSource = Storage::disk('documents')->path($image->original_storage_path);
        $outputPath = $scratchDir.'/preview.png';
        $this->processor->process($absoluteSource, $image->params, $outputPath);

        return $outputPath;
    }

    public function newScratchDir(): string
    {
        return $this->working->newScratchDir();
    }

    public function cleanupScratchDir(string $absolutePath): void
    {
        $this->working->cleanupScratchDir($absolutePath);
    }

    private function assertRealImage(UploadedFile $file): void
    {
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $realMime = $finfo ? finfo_file($finfo, $file->getRealPath()) : false;
        if ($finfo) {
            finfo_close($finfo);
        }
        if (! in_array($realMime, self::ACCEPTED_MIME_TYPES, true)) {
            throw ScanException::unsupportedImageType();
        }
    }

    private function normalizeParamChanges(array $changes, ScanSessionImage $image): array
    {
        $normalized = [];

        if (array_key_exists('rotationDegrees', $changes)) {
            $degrees = (int) $changes['rotationDegrees'];
            if (! in_array($degrees, [0, 90, 180, 270, -90], true)) {
                throw ScanException::invalidParams('rotationDegrees must be one of 0, 90, 180, 270, or -90.');
            }
            $normalized['rotationDegrees'] = $degrees;
        }

        if (array_key_exists('deskew', $changes)) {
            $normalized['deskew'] = (bool) $changes['deskew'];
        }

        if (array_key_exists('crop', $changes)) {
            $crop = $changes['crop'];
            if ($crop === null) {
                $normalized['crop'] = null;
            } else {
                if (! is_array($crop) || ! isset($crop['x'], $crop['y'], $crop['width'], $crop['height'])) {
                    throw ScanException::invalidParams('crop requires {x, y, width, height}.');
                }
                if ((float) $crop['width'] <= 0 || (float) $crop['height'] <= 0) {
                    throw ScanException::invalidParams('crop width and height must be positive.');
                }
                $normalized['crop'] = [
                    'x' => (float) $crop['x'], 'y' => (float) $crop['y'],
                    'width' => (float) $crop['width'], 'height' => (float) $crop['height'],
                ];
            }
        }

        foreach (['brightness', 'contrast'] as $field) {
            if (array_key_exists($field, $changes)) {
                $value = (float) $changes[$field];
                if ($value < -100 || $value > 100) {
                    throw ScanException::invalidParams("{$field} must be between -100 and 100.");
                }
                $normalized[$field] = $value;
            }
        }

        foreach (['sharpen', 'noiseReduction'] as $field) {
            if (array_key_exists($field, $changes)) {
                $value = (float) $changes[$field];
                if ($value < 0 || $value > 100) {
                    throw ScanException::invalidParams("{$field} must be between 0 and 100.");
                }
                $normalized[$field] = $value;
            }
        }

        foreach (['backgroundCleanup', 'excluded'] as $field) {
            if (array_key_exists($field, $changes)) {
                $normalized[$field] = (bool) $changes[$field];
            }
        }

        return $normalized;
    }
}
