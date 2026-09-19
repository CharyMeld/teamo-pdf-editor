<?php

namespace App\Exceptions;

/**
 * Phase 7 (OCR): covers every real-world rejection the OCR endpoints and
 * pipeline can produce — distinct from PageOperationException because
 * these are OCR-specific concerns (language availability, tesseract/
 * poppler failures) rather than page-reference/permutation validation.
 */
class OcrException extends DomainException
{
    public static function unsupportedLanguage(string $language): self
    {
        return new self("The language \"{$language}\" is not installed on this server.");
    }

    public static function emptyPageSelection(): self
    {
        return new self('At least one page must be selected for OCR.');
    }

    public static function invalidPageNumbers(array $pages, int $pageCount): self
    {
        return new self(
            'One or more page numbers are out of range for this document ('.
            "{$pageCount} pages): ".implode(', ', $pages).'.'
        );
    }

    public static function jobNotCancellable(): self
    {
        return new self('This OCR job has already finished and can no longer be cancelled.');
    }

    public static function processingFailed(string $detail): self
    {
        return new self("OCR could not be completed: {$detail}");
    }
}
