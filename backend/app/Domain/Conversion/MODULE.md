# Conversion

**Responsibility:** Converting between PDF and other document formats (Office
formats via LibreOffice headless, images, etc).

**Owns:** No tables — produces new `document_versions`/export files via Documents
and Files.

**Phase 0 status:** Scaffolded directory only, no logic. LibreOffice/`soffice` is
NOT yet installed on this host — it's a planned dependency for when this module
gets real logic, not installed prematurely per Phase 0 scope.
