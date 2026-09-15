# Pages

**Responsibility:** Per-page metadata for a document version — count, dimensions,
rotation, order — needed for thumbnails, navigation, and page management
(reorder/insert/delete/rotate).

**Owns:** `document_pages` table (`App\Models\DocumentPage`) — geometry for a
*saved* `document_version`. A working copy's in-progress page geometry (before
Save) lives on `document_edit_operations.pages_snapshot` instead (owned by the
Editing module) — see ARCHITECTURE.md's Phase 3 section for why the two are
kept separate.

**Phase 2 status:** Populated by `Rendering`'s `DocumentThumbnailRenderer` at
upload time and after every Save (Phase 3).
