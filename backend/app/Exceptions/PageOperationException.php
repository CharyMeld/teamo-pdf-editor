<?php

namespace App\Exceptions;

/**
 * The Editing module's first real DomainException subclass (Phase 3).
 * Covers every real-world rejection a page operation can produce: invalid
 * page references, malformed payloads (not a real permutation, etc.), or
 * the underlying qpdf/Ghostscript process itself failing. Distinct from
 * DocumentValidationException, which is about the *uploaded file itself*
 * being unreadable — this is about an operation's *request* against an
 * already-valid document being invalid.
 */
class PageOperationException extends DomainException
{
    public static function invalidPageNumbers(array $pages, int $pageCount): self
    {
        return new self(
            'One or more page numbers are out of range for this document ('.
            "{$pageCount} pages): ".implode(', ', $pages).'.'
        );
    }

    public static function emptyPageSelection(): self
    {
        return new self('At least one page must be selected for this operation.');
    }

    public static function invalidPermutation(): self
    {
        return new self('The new page order must contain every current page exactly once.');
    }

    public static function wouldLeaveNoPages(): self
    {
        return new self('This operation would remove every page — a document must have at least one page.');
    }

    public static function invalidRotation(int $degrees): self
    {
        return new self("Rotation must be one of 90, 180, 270, or -90 degrees (got {$degrees}).");
    }

    public static function invalidCropBox(): self
    {
        return new self('The crop box must lie within the page and have a positive width and height.');
    }

    public static function nothingToUndo(): self
    {
        return new self('There is no change to undo.');
    }

    public static function nothingToRedo(): self
    {
        return new self('There is no change to redo.');
    }

    public static function nothingToSave(): self
    {
        return new self('There are no pending changes to save.');
    }

    public static function documentNotReady(): self
    {
        return new self('This document is not ready for editing yet.');
    }

    public static function foreignDocumentMismatch(): self
    {
        return new self('The other document could not be used for this operation (not found, not owned by you, or not ready).');
    }

    public static function processingFailed(string $detail): self
    {
        return new self("The page operation could not be completed: {$detail}");
    }

    public static function invalidReplacementSource(): self
    {
        return new self('The replacement page source is not a valid single-source PDF.');
    }

    public static function invalidFont(string $font): self
    {
        return new self("Unknown font '{$font}'. Available fonts: ".implode(', ', \App\Domain\Editing\Services\PdfContentEngine::AVAILABLE_FONTS).'.');
    }

    public static function invalidColor(string $value): self
    {
        return new self("'{$value}' is not a valid color — use a hex value like #1A2B3C.");
    }

    public static function invalidTextParams(string $detail): self
    {
        return new self("Invalid text content: {$detail}");
    }

    public static function invalidImageSource(): self
    {
        return new self('The uploaded file is not a valid, readable image.');
    }

    public static function objectNotFound(): self
    {
        return new self('That content object does not exist, was deleted, or belongs to a different document state.');
    }

    public static function annotationNotFound(): self
    {
        return new self('That annotation does not exist, was deleted, or belongs to a different document state.');
    }

    public static function invalidAnnotationParams(string $detail): self
    {
        return new self("Invalid annotation: {$detail}");
    }
}
