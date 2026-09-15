# Files

**Responsibility:** Physical file I/O for document bytes — writing to and reading
from the `documents` and `temp` storage disks, filename sanitization, checksums.
This is the *only* module allowed to touch `Storage::disk('documents')` /
`Storage::disk('temp')` directly; every other module asks Files to read/write on
its behalf.

**Owns:** No tables of its own — operates against `document_versions.storage_path`
written by the Documents module.

**Exposes (future):** `store()`, `read()`, `delete()`, checksum helpers.

**Phase 0 status:** Disk configuration only (`config/filesystems.php` disks
`documents` and `temp`, private, with the path convention documented in
ARCHITECTURE.md). No service class yet — nothing to store until Phase 1's upload
endpoint exists.
