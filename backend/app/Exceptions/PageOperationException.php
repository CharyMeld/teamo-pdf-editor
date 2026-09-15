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
}
