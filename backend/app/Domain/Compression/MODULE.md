# Compression

**Responsibility:** Reducing PDF file size (image downsampling, stream
recompression) via Ghostscript.

**Owns:** No tables — produces new `document_versions` via Documents and Files.

**Phase 0 status:** Scaffolded directory only, no logic. Ghostscript (`gs`) is
already installed on the host (see ARCHITECTURE.md's engine table) but not yet
wired to anything.
