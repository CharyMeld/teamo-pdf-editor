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
`Services/PdfPageEngine.php`).

**Phase 4 status:** Foundation implemented — real content editing (added text,
overlay text edits, inserted images, and their move/resize/rotate/delete/
duplicate) via `Services/ContentObjectService.php` and the FPDI/FPDF wrapper
in `Services/PdfContentEngine.php` + `Services/RotatingFpdi.php`. Reuses the
same `document_edit_operations` step/pointer chain Phase 3 built — no new
table. See ARCHITECTURE.md's Phase 4 section for the full recomposition model
and the honest scope boundary (true in-place editing of pre-existing PDF text,
and manipulating pre-existing embedded images, are both explicitly out of
scope — not attempted, not faked).
