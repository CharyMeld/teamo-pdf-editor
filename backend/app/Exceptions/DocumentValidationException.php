<?php

namespace App\Exceptions;

/**
 * The Documents module's first real DomainException subclass (Phase 2).
 * Covers every real-world rejection the upload endpoint can produce:
 * wrong/spoofed MIME type, oversized file, or a file `pdfinfo` cannot
 * parse at all (corrupted / not actually a PDF despite passing the MIME
 * sniff). Password-protected PDFs are NOT an error here — they're
 * accepted and marked `password_protected`, see DocumentController.
 */
class DocumentValidationException extends DomainException
{
    public static function unsupportedType(): self
    {
        return new self('The uploaded file is not a valid PDF document.');
    }

    public static function oversized(int $maxMb): self
    {
        return new self("The uploaded file exceeds the {$maxMb}MB size limit.");
    }

    public static function corrupted(): self
    {
        return new self('The uploaded file could not be read as a PDF — it may be corrupted.');
    }

    public static function incorrectPassword(): self
    {
        return new self('Incorrect password.');
    }

    public static function notPasswordProtected(): self
    {
        return new self('This document is not password protected.');
    }

    public function statusCode(): int
    {
        return 422;
    }
}
