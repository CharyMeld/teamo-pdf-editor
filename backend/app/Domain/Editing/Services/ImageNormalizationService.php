<?php

namespace App\Domain\Editing\Services;

use App\Exceptions\PageOperationException;
use App\Models\Document;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Validates (real content sniff via `finfo`, not extension) and normalizes
 * an uploaded image to PNG (guarantees FPDF-compatible format regardless of
 * the source format), storing it permanently on the `documents` disk under
 * a caller-chosen subdirectory. Extracted from `ContentObjectService`
 * (Phase 4's own image-insert logic, unchanged) so Phase 5's `stamp`
 * annotation's image variant reuses the exact same proven, security-
 * sensitive normalization rather than a second, divergent copy.
 */
class ImageNormalizationService
{
    public function store(UploadedFile $file, Document $document, string $subdir): string
    {
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $realMime = $finfo ? finfo_file($finfo, $file->getRealPath()) : false;
        if ($finfo) {
            finfo_close($finfo);
        }
        if (! in_array($realMime, ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp'], true)) {
            throw PageOperationException::invalidImageSource();
        }

        $raw = @file_get_contents($file->getRealPath());
        $gd = $raw !== false ? @imagecreatefromstring($raw) : false;
        if ($gd === false) {
            throw PageOperationException::invalidImageSource();
        }

        // Preserve transparency for PNG/GIF/WebP sources.
        imagesavealpha($gd, true);
        imagealphablending($gd, true);

        ob_start();
        imagepng($gd);
        $pngBytes = ob_get_clean();
        imagedestroy($gd);

        $storagePath = "{$document->uuid}/{$subdir}/".Str::uuid().'.png';
        Storage::disk('documents')->put($storagePath, $pngBytes);

        return $storagePath;
    }
}
