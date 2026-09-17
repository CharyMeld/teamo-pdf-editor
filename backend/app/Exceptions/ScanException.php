<?php

namespace App\Exceptions;

/**
 * Phase 6 (scanning/image-import): covers every real-world rejection the
 * scan-session endpoints can produce.
 */
class ScanException extends DomainException
{
    public static function unsupportedImageType(): self
    {
        return new self('The uploaded file is not a valid JPG, PNG, or TIFF image.');
    }

    public static function invalidParams(string $detail): self
    {
        return new self("Invalid image adjustment: {$detail}");
    }

    public static function invalidReorder(): self
    {
        return new self('The new order must contain every image in this session exactly once.');
    }

    public static function noImages(): self
    {
        return new self('At least one non-excluded image is required to create a PDF.');
    }

    public static function imageNotFound(): self
    {
        return new self('That image does not exist or belongs to a different scan session.');
    }
}
