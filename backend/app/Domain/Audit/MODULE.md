# Audit

**Responsibility:** Immutable record of user actions on documents, for
compliance/traceability (who did what, when).

**Owns:** `audit_logs` table (`App\Models\AuditLog`). Rows survive deletion of
their user or document (`nullOnDelete`) — the log entry must outlive the thing it
describes.

**Exposes (future):** A single `record(action, document, context)` write path
used by every other module — no module writes audit rows ad hoc.

**Phase 0 status:** Schema + model only. Nothing writes an audit row yet — the
first write happens when Phase 1's upload endpoint ships (`document.uploaded`).
