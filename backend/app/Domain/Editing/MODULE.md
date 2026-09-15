# Editing

**Responsibility:** In-place document editing operations (page manipulation,
content edits) that produce a new working state before it's saved as a
`document_versions` row.

**Owns:** `document_edit_operations` table (`App\Models\DocumentEditOperation`)
— the real "working copy" implementation (see ARCHITECTURE.md's document state
model, and this module's own `Services/WorkingCopyManager.php` docblock).

**Phase 3 status:** Foundation implemented — page-level structural editing only
(insert/delete/reorder/duplicate/rotate/extract/split/merge/replace/crop via
`Services/PageOperationService.php` and the qpdf/Ghostscript wrapper in
`Services/PdfPageEngine.php`). Content-level edits (text/image editing) are not
in scope for any phase yet.
