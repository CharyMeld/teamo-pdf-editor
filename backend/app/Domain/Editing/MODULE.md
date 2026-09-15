# Editing

**Responsibility:** In-place document editing operations (page manipulation,
content edits) that produce a new working state before it's saved as a
`document_versions` row.

**Owns:** No tables yet — the "current editing state" is explicitly *not* a
persisted row at Phase 0 (see ARCHITECTURE.md's document state model); this
module is where that gets a real home once editing ships.

**Phase 0 status:** Scaffolded directory only, no logic.
