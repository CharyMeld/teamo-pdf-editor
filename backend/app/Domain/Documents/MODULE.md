# Documents

**Responsibility:** The logical document entity — identity, ownership, status, and
the version history that represents its lifecycle (original upload, each save,
current pointer).

**Owns:** `documents`, `document_versions` tables (`App\Models\Document`,
`App\Models\DocumentVersion`).

**Exposes (future):** Upload/validate/save/list/delete services and their
controllers. Any other module that needs "what is this document, what's its
current file" goes through this module — it does not reach into the `documents`
storage disk directly (that's the Files module's job).

**Phase 0 status:** Schema + models only (relationships, casts). No upload,
validation, or save logic yet — that is Phase 1's OPEN→VALIDATE→LOAD slice.
