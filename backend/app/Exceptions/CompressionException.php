<?php

namespace App\Exceptions;

/**
 * Phase 9 (PDF and file compression): covers every real-world rejection
 * the compression endpoints can produce.
 */
class CompressionException extends DomainException
{
    public static function unsupportedFormat(string $detail): self
    {
        return new self("Unsupported compression format: {$detail}");
    }

    public static function unsupportedPreset(string $detail): self
    {
        return new self("Unsupported compression preset: {$detail}");
    }

    public static function outputNotReady(): self
    {
        return new self('This compression has not finished yet.');
    }

    public static function jobNotCompleted(): self
    {
        return new self('This compression must finish successfully before it can replace the original.');
    }

    public static function processingFailed(string $detail): self
    {
        return new self("The compression could not be completed: {$detail}");
    }
}
