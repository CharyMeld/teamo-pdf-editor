# Annotations

**Responsibility:** User-added annotations on a document version (comments,
highlights, shapes — exact types defined when the ANNOTATE tab ships).

**Owns:** `annotations` table (`App\Models\Annotation`).

**Phase 0 status:** Schema + model only, `data` is a JSON column with no fixed
shape yet — the schema per annotation type is a Phase-Annotate decision.
