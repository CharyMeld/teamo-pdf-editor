<?php

namespace App\Exceptions;

/**
 * Phase 8 (document conversion): covers every real-world rejection the
 * conversion endpoints can produce — unsupported source format, an
 * invalid page selection, or the underlying pdftotext/pdftoppm/pdftohtml/
 * pandoc/wkhtmltopdf pipeline failing.
 */
class ConversionException extends DomainException
{
    public static function unsupportedFormat(string $detail): self
    {
        return new self("Unsupported conversion format: {$detail}");
    }

    public static function unsupportedSourceFile(): self
    {
        return new self('The uploaded file is not a real .docx Word document. Legacy .doc, .xlsx, and .pptx files are not supported by this conversion.');
    }

    public static function emptyPageSelection(): self
    {
        return new self('At least one page must be selected for this conversion.');
    }

    public static function invalidPageNumbers(array $pages, int $pageCount): self
    {
        return new self(
            'One or more page numbers are out of range for this document ('.
            "{$pageCount} pages): ".implode(', ', $pages).'.'
        );
    }

    public static function outputNotReady(): self
    {
        return new self('This conversion has not finished yet.');
    }

    public static function processingFailed(string $detail): self
    {
        return new self("The conversion could not be completed: {$detail}");
    }
}
