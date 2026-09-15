# TeamO PDF Editor — Architecture

TeamO PDF Editor is a production PDF and document workspace for TeamO Digital
Solutions: a Laravel API backend and a React/TypeScript single-page frontend built
around the "TeamO Command Ribbon" — a task-oriented command bar (HOME, EDIT, VIEW,
ORGANIZE, ANNOTATE, FORMS, OCR, CONVERT, COMPRESS, SIGN, AI, HELP) over a
three-pane document workspace (thumbnails, canvas, Smart Inspector). This document
is the standing reference for the application's architecture; it is updated as
each phase adds real functionality, not rewritten.

**Phase 0 (this phase) delivers architecture and foundation only — no document
upload, rendering, editing, or processing features exist yet.** See "What Phase 0
does NOT include" at the end.

## Document lifecycle

```
OPEN → VALIDATE → LOAD → RENDER → EDIT → SAVE → PROCESS → EXPORT
```

| Stage | What happens | Owning module(s) |
|---|---|---|
| OPEN | User selects/uploads a file in the browser | Frontend (thin client) |
| VALIDATE | Server checks real MIME type, size limit, sanitizes filename | Files |
| LOAD | File persisted to the `documents` disk; a `documents` row + version-1 `document_versions` row created | Documents, Files |
| RENDER | Page images/thumbnails generated for the canvas and thumbnail panel; `document_pages` populated | Rendering, Pages |
| EDIT | User makes changes in the workspace; held as in-memory/working state, not yet persisted | Editing |
| SAVE | A new `document_versions` row is written; previous version's `is_current` flips off | Documents, Files |
| PROCESS | Background jobs (OCR, conversion, compression, AI) run against a version, tracked via `document_jobs` | Ocr, Conversion, Compression, Ai, Jobs |
| EXPORT | Final output written to the `exports/` path on the `documents` disk and streamed to the user | Documents, Files |

## Document state model

The spec requires a document to distinguish six states. Here is exactly what each
maps to:

| State | Representation |
|---|---|
| **Original uploaded file** | `document_versions` row with `version_number = 1` for that document. Never mutated after creation. |
| **Working copy** | Not a persisted row. While a user is actively editing, changes live client-side (and, once implemented, in a scratch file on the `temp` disk keyed to the editing session). This is a deliberate Phase 0 decision — no "editing session" table exists yet; adding one is deferred until the Editing module has real logic and a concrete need for server-side crash recovery is confirmed. |
| **Current editing state** | Same as "working copy" above — the in-progress, unsaved state. Becomes a new version only on SAVE. |
| **Saved version** | A `document_versions` row with `is_current = true` for its document. Every SAVE creates one; older versions remain queryable as history. |
| **Exported output** | A file written to `documents/{uuid}/exports/` on the `documents` disk. Not itself a `document_versions` row (exports are derived output, e.g. a compressed or converted copy) — recorded via a `document_jobs` row of type `export` once implemented, or the download is streamed directly for a synchronous export in a later phase. |
| **Temporary processing files** | Live on the separate `temp` disk (`storage/app/private/temp`), never the `documents` disk. Swept by a scheduled cleanup command added alongside the first background job type. |

## Database schema

Only tables with a justified Phase 0 need were created. Each migration lives in
`backend/database/migrations/`.

| Table | Purpose |
|---|---|
| `users` | Laravel default (id, name, email, password, timestamps) — unmodified except for Sanctum's `HasApiTokens` trait on the model. |
| `documents` | The logical document entity: identity (`uuid`), ownership (`user_id`), display metadata, lifecycle `status`. Soft-deletes so a delete is recoverable before permanent purge. |
| `document_versions` | Every saved snapshot (original = version 1). Points at a physical file via `storage_disk` + `storage_path`, with a `checksum_sha256` for integrity verification. `is_current` marks the active version. |
| `document_pages` | Per-page geometry (`width_pt`, `height_pt`, `rotation_degrees`) for a specific version, needed for thumbnails and page-management in later phases. |
| `document_jobs` | Background processing tracking (OCR, conversion, compression, AI, export) — `job_type` is a free string since the set of job types will grow across phases; `status`/`progress_percent`/`error_message` support UI progress indicators. |
| `annotations` | User-added annotations on a version; `data` is JSON with no fixed shape yet — defined when the ANNOTATE tab ships. |
| `audit_logs` | Immutable (`created_at` only) record of user actions for compliance. `user_id`/`document_id` are `nullOnDelete` — a log entry outlives the thing it describes. |
| `settings` | Runtime-editable key/value app configuration. |

Explicitly **not** created at Phase 0 (no justified schema yet): tables for forms,
signatures, AI conversation/session data, or search indexes. Each is added when its
phase is scoped.

## Storage architecture

Two private local disks (`backend/config/filesystems.php`), neither under
`storage/app/public` — nothing is ever served through the public symlink:

- **`documents`** (`storage/app/private/documents`) — all document bytes.
  Path convention (enforced by application code, not the disk config):
  - `documents/{document_uuid}/original/{filename}`
  - `documents/{document_uuid}/versions/{version_number}/{filename}`
  - `documents/{document_uuid}/exports/{filename}`
- **`temp`** (`storage/app/private/temp`) — transient processing output (OCR
  intermediates, conversion scratch files, working-copy scratch data). Nothing here
  is durable; a scheduled cleanup command is added alongside the first background
  job type.

Both disks are configured `'serve' => false, 'throw' => true` — files are only ever
reachable through an authenticated controller that checks document ownership
first, never via a direct URL.

## Module boundaries

`backend/app/Domain/<Module>/` — one directory per module, each with a `MODULE.md`
stating its responsibility, what it owns, and its Phase 0 status.

| Module | Phase 0 status | Real logic ships in |
|---|---|---|
| Auth | Handled by Laravel/Sanctum defaults | Phase 1 (login/register endpoints) |
| Users | Model only | — |
| Documents | Schema + model | Phase 1 (upload/validate/save) |
| Files | Disk config only | Phase 1 (upload endpoint) |
| Rendering | Scaffolded | Phase 1 |
| Pages | Schema + model | Phase 1 |
| Editing | Scaffolded | Phase (Edit) |
| Annotations | Schema + model | Phase (Annotate) |
| Ocr | Scaffolded | Phase (OCR) |
| Conversion | Scaffolded | Phase (Convert) |
| Compression | Scaffolded | Phase (Compress) |
| Forms | Scaffolded, no schema | Phase (Forms) |
| Signatures | Scaffolded, no schema | Phase (Sign) |
| Ai | Scaffolded, no schema | Phase (AI) — local Ollama only, never an external AI service |
| Search | Scaffolded, no schema | Phase (Search) |
| Jobs | Schema + model (job tracking) | As each processing module ships |
| Settings | Schema + model | As features need runtime config |
| Audit | Schema + model | Phase 1 (`document.uploaded` is the first write) |

## API / service boundary rule

**All PDF processing, file I/O, and business logic live server-side**, inside the
modules above. The frontend (`frontend/src/`) is a thin REST client — it never
touches the filesystem, never runs PDF libraries, and never contains business
rules. The only frontend-backend integration code at Phase 0 is
`frontend/src/lib/api.ts`, a single axios instance, used today only for the health
check. Every future feature adds a REST endpoint the frontend calls, not client-side
processing logic.

## Job / background-processing architecture (plan)

- Laravel queues, driver `database` for now (already configured via
  `QUEUE_CONNECTION=database`; framework's `jobs`/`failed_jobs` tables are already
  migrated). Redis is a documented drop-in upgrade when throughput requires it —
  no code changes needed beyond the queue connection config.
- `document_jobs` is the source of truth the frontend polls (or, later,
  subscribes to) for progress — `status`, `progress_percent`, `error_message`.
- No `Job` classes exist yet — there is nothing to run until a processing module
  (Ocr, Conversion, Compression, Ai) has real logic. Each future job type extends
  a shared base class added in the Jobs module at that time.

## Upload security rules (policy — enforced starting with Phase 1's upload endpoint)

- **Real MIME sniffing**, not file extension: PHP `finfo` reads actual file
  content. Initial allowlist: `application/pdf` only. Extensible per-module later
  (e.g. Conversion will allow Office MIME types for its own upload path).
- **Max upload size**: 100MB default, configurable via `DOCUMENTS_MAX_UPLOAD_MB`
  in `.env` (already present in `backend/.env` as a documented default; not yet
  read by any code).
- **Filenames**: sanitized to a generated UUID on disk; the original filename is
  preserved only in the `documents.original_filename` column, never used as a
  path component.
- **Storage**: always private (see Storage architecture above) — never the public
  disk.
- **Temp files**: isolated on the `temp` disk, never mixed with durable document
  storage, swept by a future scheduled cleanup job.

## Error handling conventions

- `App\Exceptions\DomainException` (`backend/app/Exceptions/DomainException.php`)
  is the abstract base every module's future exceptions extend — carries
  `statusCode(): int` (default 422) and `context(): array` for structured logging.
  No subclasses exist yet since no module has logic to throw from.
- API routes (`bootstrap/app.php`'s `withExceptions`) render a consistent JSON
  envelope: `{"error": {"message": ..., "code": ...}}`. In production, a 500's
  message is replaced with a generic string — internal details are never leaked
  to clients.

## Logging conventions

Three dedicated channels (`backend/config/logging.php`), alongside Laravel's
default `stack`/`single`:

- **`documents`** — document lifecycle events (upload, save, delete).
- **`jobs`** — background job lifecycle (queued, started, completed, failed).
- **`audit`** — mirrors what's written to the `audit_logs` table, retained 365
  days.

Rule: **logs must never contain raw filesystem paths or full file contents** —
only IDs, UUIDs, and structured context. No code writes to these channels yet;
they exist so the first module that needs them doesn't also need a config change.

## Responsive architecture (policy — not yet implemented)

Desktop-first; the workspace is optimized for professional desktop use, but
degrades rather than breaks below that:

- **≥1024px**: full ribbon with labeled tabs and command groups, both side panels
  visible.
- **<1024px** (planned): ribbon collapses to icon-only tabs.
- **<768px** (planned): Smart Inspector becomes an off-canvas drawer instead of a
  fixed right panel; thumbnail panel becomes collapsible.

Phase 0's layout uses fixed-width side panels and does not yet implement these
breakpoints — it doesn't visibly break at ~800px (panels are just less generous),
but the collapse/drawer behavior above is a documented plan for a later phase, not
built now.

## Route structure

**Backend** (`backend/routes/api.php`):
- `GET /api/health` — real health check, no auth.
- `GET /api/user` — returns the authenticated user (`auth:sanctum`).
- `GET /sanctum/csrf-cookie` — Sanctum's SPA CSRF bootstrap (framework-provided).

Planned Phase 1 additions: `POST /api/login`, `POST /api/logout`,
`POST /api/documents` (upload), `GET /api/documents`, `GET /api/documents/{uuid}`.

**Frontend** (`frontend/src/App.tsx`, React Router):
- `/` → `WorkspacePage` (header + ribbon + three-pane workspace + status bar).

Planned Phase 1 addition: `/login`.

## Folder structure

```
backend/
  app/
    Domain/                  # module boundary docs (MODULE.md per module)
      Auth/ Users/ Documents/ Files/ Rendering/ Pages/ Editing/
      Annotations/ Ocr/ Conversion/ Compression/ Forms/ Signatures/
      Ai/ Search/ Jobs/ Settings/ Audit/
    Exceptions/
      DomainException.php    # shared base for future module exceptions
    Models/                  # Eloquent models (standard Laravel location)
      User.php Document.php DocumentVersion.php DocumentPage.php
      DocumentJob.php Annotation.php AuditLog.php Setting.php
  config/
    filesystems.php          # + `documents`, `temp` private disks
    logging.php              # + `documents`, `jobs`, `audit` channels
    cors.php                 # SPA cross-origin + credentials config
  database/migrations/       # 7 domain migrations + framework/Sanctum defaults
  routes/
    api.php                  # /health, /user
  bootstrap/app.php           # Sanctum statefulApi(), JSON error envelope

frontend/
  src/
    components/
      layout/AppHeader.tsx
      ribbon/CommandTabs.tsx CommandGroup.tsx CommandRibbon.tsx
      workspace/ThumbnailPanel.tsx PdfCanvas.tsx SmartInspector.tsx
                 DocumentWorkspace.tsx StatusBar.tsx
      common/                # empty — future dialogs/modals/notifications
    pages/WorkspacePage.tsx
    lib/api.ts                # the one frontend-backend integration point
    App.tsx                   # React Router root
```

## External / open-source processing engines

| Engine | Purpose | Status |
|---|---|---|
| Ghostscript (`gs`) | Compression, PDF-to-raster fallback | Already installed on host |
| poppler-utils (`pdftoppm`, `pdftotext`) | Page rasterization, text extraction | Already installed on host |
| Tesseract | OCR | Already installed on host |
| ImageMagick (`convert`) | Image processing | Already installed on host |
| pdf.js | Client-side PDF rendering in the canvas | Not yet added to `frontend/package.json` — added in Phase 1 when RENDER is implemented |
| qpdf | Page-level manipulation (split/merge/reorder) | **Not installed** — planned dependency for the Pages/Organize phase, intentionally not installed at Phase 0 |
| LibreOffice headless (`soffice`) | Office-format conversion | **Not installed** — planned dependency for the Conversion phase, intentionally not installed at Phase 0 |

## What Phase 0 does NOT include

- No document upload, no file processing of any kind.
- No PDF rendering (canvas shows an empty state only).
- No login/register UI or working auth flow (Sanctum is wired, but there's no
  endpoint to log in against yet).
- No OCR, conversion, compression, forms, signatures, AI, or search — schema,
  services, and UI are all deferred to their own phases.
- No responsive breakpoint behavior (ribbon collapse, inspector drawer).
- No fake buttons, fake progress, or simulated processing anywhere in the UI —
  every piece of UI either does something real (tab switching, the health check)
  or honestly states it isn't implemented yet.

## Verified working (2026-09-15)

- `php artisan migrate --force`: all 7 domain migrations + framework/Sanctum
  migrations ran clean against MySQL database `teamo_pdf_editor`.
- `php artisan route:list`: 6 routes registered, no errors.
- `php artisan serve` + `curl http://localhost:8000/api/health` →
  `{"status":"ok","app":"TeamO PDF Editor","time":"..."}`, HTTP 200.
- `npm run build` (frontend): `tsc -b && vite build` completed with zero errors.
- Cross-origin request from `http://localhost:5173` to `/api/health` with
  `Origin` header returned `Access-Control-Allow-Origin` + `Access-Control-Allow-Credentials: true` + Sanctum's `XSRF-TOKEN`/session cookies — confirming the SPA
  auth wiring is live and correct, not just configured.
