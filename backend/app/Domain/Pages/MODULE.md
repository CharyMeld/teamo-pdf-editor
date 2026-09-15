# Pages

**Responsibility:** Per-page metadata for a document version — count, dimensions,
rotation, order — needed for thumbnails, navigation, and page management
(reorder/insert/delete/rotate in later phases).

**Owns:** `document_pages` table (`App\Models\DocumentPage`).

**Phase 0 status:** Schema + model only. Populated when a version is processed in
Phase 1 (page count/dimensions extracted at upload time).
