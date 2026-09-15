# Ocr

**Responsibility:** Optical character recognition over document pages, producing
searchable text layers. Wraps the system `tesseract` binary, invoked from a
background job.

**Owns:** No tables of its own — writes results via a future `document_jobs`
payload and (later) a text-layer store, TBD when this phase is scoped.

**Phase 0 status:** Scaffolded directory only, no logic. `tesseract` is already
installed on the host (see ARCHITECTURE.md's engine table) but not yet wired to
anything.
