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

## Phase 1 — application shell (2026-09-15)

Builds the real ribbon/workspace UI on top of Phase 0's foundation. **Still no
PDF processing** — no document is ever opened or rendered; every command
whose feature isn't built yet is represented as genuinely disabled, never a
dead or fake-working button. Backend is untouched; this phase is entirely
`frontend/src/`.

- **Command registry** (`commands/`): `types.ts` defines `Command` /
  `TabId` / `SelectionType`; `registry.ts` holds every command across all 12
  tabs (`status: "unavailable"` for anything not yet built; only VIEW's
  zoom/fit/page-nav are `"available"`, since those are real Phase 1 UI
  state) plus `CONTEXTUAL_COMMANDS` keyed by selection type;
  `useCommandSearch.ts` does real substring search over label/description/
  keywords; `useSelectionContext.tsx` is the selection-type context the
  contextual ribbon and inspector both read.
- **Design system**: `design-system/theme.css` — an original teal-accent/
  graphite-neutral token set (Tailwind v4 `@theme`, not Office blue or
  Acrobat red) — plus reusable primitives in `components/ui/` (`Button`,
  `IconButton`, `Tooltip`, `DropdownMenu`, `Panel`, `Badge`, `Spinner`,
  `EmptyState`, `StatusIndicator`, `Icon`). Every ribbon/header/inspector
  control is built from these, not one-off styled elements.
- **`CommandButton`** (`components/ribbon/`): the single component every
  command renders through — available commands are real buttons; anything
  `status: "unavailable"` renders visibly locked/badged, `aria-disabled`,
  non-clickable, with a tooltip that says so. This is what guarantees no
  dead or fake buttons anywhere in the ribbon, header search, or canvas.
- **Ribbon**: `CommandTabs` is a real `role="tablist"` with roving-tabindex
  keyboard navigation; `CommandGroup` renders the active tab's commands
  from the registry with a "More" overflow dropdown past a viewport-based
  cap; `ContextualCommandGroup` appends an accent-bordered group sourced
  from `CONTEXTUAL_COMMANDS` whenever a selection exists;
  `MobileCommandSheet` replaces the wide ribbon with a compact action sheet
  under 768px. `organize.rotate` demonstrates the dropdown-command pattern.
- **Workspace**: `ThumbnailPanel` and `SmartInspector` are docked panes on
  desktop and off-canvas drawers on tablet/mobile (`hooks/usePanelVisibility.tsx`,
  toggled from `StatusBar`); `SmartInspector` switches between
  `panels/{Document,Page,Selection,Properties}Panel.tsx` based on real
  selection state; `PdfCanvas` keeps an honest empty state plus the
  `.canvas-viewport` container Phase 2's pdf.js rendering mounts into.
- **`DevSelectionSimulator`**: a plainly-labeled dev-only control (renders
  inside the Smart Inspector) that drives `useSelectionContext` so the
  contextual ribbon/inspector switching can be exercised without a real PDF
  canvas — the mechanism it exercises is real; only the input source is a
  stand-in until Phase 2's canvas provides real selection events.
- **Status bar**: real page position/prev-next (genuinely disabled at
  `totalPages === 0`), zoom in/out + percent (25–400%, clamped), Fit
  Page/Fit Width toggle, a document-search input (disabled until a document
  exists), and the existing backend health indicator — all from
  `hooks/useDocumentViewState.tsx`.
- **Accessibility**: roving-tabindex tablist, `role="menu"`/`"menuitem"`
  keyboard-navigable dropdowns with focus return on close, a global
  `:focus-visible` ring token, every icon-only control labeled via
  `IconButton`'s mandatory `label` prop (doubles as its tooltip).
- **Responsive**: real breakpoint-driven behavior via
  `hooks/useMediaQuery.ts` (matchMedia-backed, not CSS-only) — desktop
  (≥1024px) full ribbon + docked panels; tablet (768–1023px) toggleable
  panel drawers + tighter overflow cap; mobile (<768px) compact tab strip +
  action-sheet command system replacing the ribbon outright, drawer-only
  panels.

### Verified working (2026-09-15)

- `tsc -b && vite build`: zero TypeScript errors, zero build errors.
- `oxlint`: zero errors (five informational warnings — Fast Refresh
  "only-export-components" on three context+hook files, one ref-in-render
  false positive in `Tooltip.tsx` where the ref is only read inside event
  handlers, not during render).
- Real interaction testing against the live `php artisan serve` +
  `npm run dev` servers via the Chrome DevTools Protocol (no document
  automation library installed in this environment, so a small CDP script
  was used instead of Playwright/Puppeteer): all 12 tabs switch and update
  `role="tabpanel"`; searching "compress" and "ocr" returns the correct
  commands; cycling the selection simulator through
  none/page/text/image/annotation correctly toggles the contextual ribbon
  group and switches the Smart Inspector's panel heading
  (Document → Page → Text/Image/Annotation Selection); zoom-in ×2 moved
  100% → 150%, Fit Width toggled `aria-pressed`; previous/next page are
  genuinely disabled; the tablet panel-toggle button opens its drawer; the
  mobile Commands button opens the action sheet and the desktop ribbon
  panel is not rendered at that width. Zero console errors across the
  session. Screenshots at 1440×900 / 820×1180 / 390×844 additionally
  confirm the visual layout at each breakpoint.

## Phase 2 — PDF viewing/rendering engine (2026-09-15)

Users can now open a real PDF and see it rendered in the workspace. This phase
is OPEN → VALIDATE → LOAD → RENDER only — **no editing, OCR, conversion,
compression, or signing** exists yet, and the HOME tab's `open` command is the
only registry command that moved from `"unavailable"` to `"available"`.

### Backend (`backend/`)

- **Upload / validate / load** — `DocumentController::store()`: real content
  MIME sniff via PHP `finfo` (not the client's `Content-Type` or filename
  extension), a configurable max size (`config/documents.php`,
  `DOCUMENTS_MAX_UPLOAD_MB`, default 100MB), then `pdfinfo` against the
  uploaded file to detect corruption before anything is persisted. The
  original bytes are written once, untouched, to
  `documents/{uuid}/original/original.pdf` on the `documents` disk and never
  modified again — verified by `sha256` comparison against the source file
  both immediately after upload and after the thumbnail job completes.
  **Storage-path clarification**: Phase 0's convention strings
  (`documents/{uuid}/...`) describe paths *on the `documents` disk*, whose
  root already **is** `storage/app/private/documents` — the actual
  disk-relative paths written by this phase omit the redundant leading
  `documents/` segment (e.g. `{uuid}/original/original.pdf`,
  `{uuid}/versions/{n}/thumbnails/{page}.png`), to avoid a doubled
  `documents/documents/...` directory.
- **Page rendering** — `App\Domain\Rendering\Services\DocumentThumbnailRenderer`
  (the Rendering module's first real logic): runs `pdftoppm` per page at
  110 DPI (`DOCUMENTS_THUMBNAIL_DPI`), reads each page's real dimensions back
  from the rendered PNG's own pixel size (accounts for the PDF's intrinsic
  rotation automatically, since `pdftoppm` bakes it into the raster), and
  writes one `document_pages` row + one thumbnail PNG per page. A single bad
  page doesn't fail the whole document — it's skipped and simply has no
  thumbnail row, which the frontend treats as a real per-page error state,
  not silent success.
- **Background jobs** — `App\Jobs\GenerateDocumentThumbnails` (queued,
  `database` driver, the Jobs module's first real job class) handles the
  normal unencrypted-upload path; `document_jobs.progress_percent` is updated
  page-by-page and is what the frontend polls.
- **Password handling** — password-protected uploads are accepted and stored
  (status `password_protected`) but not queued for rendering. On
  `POST /api/documents/{id}/unlock`, the password is verified server-side
  (a `pdfinfo -upw` check) and, on success, passed straight into
  `DocumentThumbnailRenderer` **synchronously — deliberately not queued** —
  so it never has to be serialized into the `jobs` table. It exists only as
  a plain local PHP variable on that request's call stack: never persisted,
  logged, or queued. The stored original stays genuinely encrypted at rest;
  the frontend independently re-supplies the same password to pdf.js when it
  opens the file for the canvas, so nothing is ever decrypted-and-rewritten
  server-side.
- **Status model** — `documents.status` gained `password_protected`
  alongside the existing values; `documents.page_count` and
  `document_pages.thumbnail_path` are new columns
  (`2026_09_15_130000_add_phase2_columns_to_documents_and_pages.php`, a raw
  `ALTER TABLE ... MODIFY` for the enum since this project doesn't depend on
  doctrine/dbal).
- **Audit** — the Audit module's first real writes:
  `document.uploaded` (on upload), `document.opened` (on
  `GET /api/documents/{id}`, not the lightweight polling `.../status`
  endpoint), `document.unlocked` / `document.unlock_failed`.
- **Dev-only auth shortcut** — `DevAuthController` (`POST /api/dev/login`,
  hard-gated to `app()->environment('local')`, 404s otherwise) logs in a
  single seeded `dev@teamo.local` user via a real Sanctum SPA session — not
  a mock: it's the same session mechanism a real login endpoint will use.
  There is still no login/register UI; this exists only so
  `documents.user_id` (a real foreign key) has something real to point at
  until Auth ships its own phase. `routes/web.php` also gained a stub
  `GET /login` route — Laravel's default `Authenticate` middleware resolves
  `route('login')` to build an unused redirect target on every
  `AuthenticationException`, and without a route by that name it throws a
  `RouteNotFoundException` that masks the real 401; the stub exists purely
  so that resolution doesn't fail (nothing ever navigates there — API
  requests always get the real JSON 401).
- **Exception handling** — `bootstrap/app.php`'s JSON envelope now also maps
  `ValidationException` → 422 (with field errors), `ModelNotFoundException` →
  404, and `AuthenticationException`/`AuthorizationException` → 401/403,
  closing a gap where these fell through to a generic 500.

### Frontend (`frontend/src/`)

- **`lib/pdf.ts`** — the one place `pdfjs-dist` is configured (Vite-native
  worker resolution via `new URL(...)`). Rendering is client-side pdf.js
  fetching real bytes from `GET /api/documents/{id}/file`
  (`withCredentials: true`; a `BinaryFileResponse`, so HTTP Range requests
  work — confirmed via `curl -r 0-999` returning real `206 Partial
  Content`/`Content-Range`; pdf.js itself chose to stream the whole file in
  one request rather than issue explicit ranged fetches for the 9MB/261-page
  test file over local network, which is expected adaptive pdf.js behavior,
  not a bug — the capability is real and server-verified even though this
  particular file didn't exercise it in-browser). This is *display* only —
  all storage/validation/business logic stays server-side per the existing
  API/service boundary rule.
- **`hooks/useOpenDocument.tsx`** — owns the whole open-document lifecycle:
  upload, status polling while the backend job runs, password unlock, the
  shared `pdfjs-dist` document instance (loaded once, used by both the
  canvas and search), and a client-side search index built from that same
  document's real per-page `getTextContent()` (yields periodically so a
  261-page index-build doesn't jank the canvas). `hooks/useDocumentViewState.tsx`
  gained real `documentId`/`currentPage`/`totalPages`/`goToPage` (Phase 1 had
  these fixed at 0/no-ops) plus `syncComputedZoomPercent`, a setter Fit
  Page/Fit Width use to publish their computed scale without clearing
  `fitMode` (unlike the user-facing `setZoomPercent`, which is an explicit
  manual override).
- **`PdfViewer.tsx`** — continuous-scroll canvas with real virtualization: an
  `IntersectionObserver` (not a scroll-position heuristic) decides which
  pages are near the viewport and get a real `<canvas>`; everything else is
  a correctly-sized empty placeholder sized from the backend's real
  `width_pt`/`height_pt`. Verified bounded at 2–3 rendered canvases at a time
  while scrolling the 261-page test document, both at page 1 and after
  jumping to page 150. Each page's render is guarded by a monotonically
  increasing per-page token, not just `RenderTask.cancel()` — a real bug
  caught during testing (two zoom clicks in quick succession raced two
  `render()` calls on the same `<canvas>`, and the loser's rejection was
  briefly mistaken for a genuine per-page failure) is fixed by having every
  `.then`/`.catch` check it's still the current attempt before touching the
  canvas or `pageErrors` state.
- **Thumbnails** — `ThumbnailPanel`/`ThumbnailItem` render real
  `<img crossOrigin="use-credentials">` tags against
  `GET /api/documents/{id}/pages/{n}/thumbnail`; a page not yet thumbnailed
  shows a real loading spinner, not a placeholder image.
- **Password flow** — `PasswordPrompt` (inline, not a modal — there's nothing
  useful behind it) calls `POST /api/documents/{id}/unlock`; wrong password
  shows a real inline error and the form stays open; correct password
  retains the plaintext only in a component-local ref, used solely to hand
  the same password to pdf.js so it can open the still-encrypted original.
- **`OpenDocumentDialog`** (`components/dialogs/`, built on a new
  `components/ui/Dialog.tsx` focus-trap primitive) — drag-and-drop or file
  picker upload, plus a real "Open recent" list from
  `GET /api/documents`. This is what `home.open`'s `run` is wired to,
  supplied by whichever component renders that command (`CommandRibbon`,
  `AppHeader`'s search, `PdfCanvas`'s empty state) via `CommandButton`'s
  existing `onRun` override — not a special case outside the registry.
- **Smart Inspector** — `DocumentPanel`/`PagePanel` now show real
  title/page-count/file-size/upload-date/status and real per-page geometry
  once a document is open, replacing Phase 1's permanent `"—"` placeholders;
  they still show honest placeholders with nothing open.

### Deviations from the original Phase 2 brief

- Password-protected documents render synchronously (not queued) — see
  above; this is a correctness requirement (never persist a password), not
  scope creep.
- `bootstrap/app.php` and `routes/web.php` gained small, necessary fixes
  (exception-status mapping, the `login` route stub) surfaced by real testing
  of the auth/error paths, not planned features.

### What Phase 2 does NOT include

Real page/text/image editing, OCR, conversion, compression, signing, AI, a
real login/register UI, or a "working copy" persistence mechanism (still
deferred per the document state model above — Phase 2 only ever touches the
read-only "original" version and pure client-side view state). Only
`home.open` is `"available"` in the command registry; every other command
remains honestly `"unavailable"`.

### Verified working (2026-09-15)

All of the following were exercised against the real running
`php artisan serve` + `php artisan queue:work` + `npm run dev` stack — not
inferred from code review — using either `curl` (for API-level checks,
including cookie/CSRF-carrying requests simulating the SPA) or a small
Chrome DevTools Protocol script driving real Chrome (no Playwright/Puppeteer
installed in this environment; Node 22's native `WebSocket`/`fetch` were
enough, no new dependency added):

- `php artisan migrate --force`: the new Phase 2 migration ran clean against
  `teamo_pdf_editor`, alongside all prior migrations (12 total).
- `tsc -b && vite build`: zero errors, both before and after the render-race
  fix above.
- **Single-page PDF**: real upload → real canvas render → real matching
  thumbnail, confirmed visually.
- **Multi-page (8-page) text PDF**: all 8 real thumbnails; prev/next and
  direct page-number entry both work; search for a real word from the
  document's own text found 6 real occurrences with working next/previous
  match navigation.
- **Large (261-page, 8.9MB) PDF**: all 261 real thumbnails generated;
  canvas count stayed at 2–3 throughout — at page 1, after a direct jump to
  page 150, and after scrolling — confirming virtualization actually bounds
  DOM/canvas count rather than rendering everything; the file endpoint's
  Range support was confirmed via `curl -r 0-999` → real `206 Partial
  Content`, though the in-browser pdf.js load for this file used a single
  streamed request rather than explicit ranged fetches (stated honestly
  above, not claimed as something it wasn't).
- **Password-protected PDF, wrong-password path**: verified on the user's
  own real encrypted file (`Lessons_in_translation_...pdf`) — real inline
  "Incorrect password" error, form stays open, backend logs
  `document.unlock_failed`.
- **Password-protected PDF, full unlock path**: the real file's actual
  password is unknown, so this was verified end-to-end on a
  Ghostscript-synthesized encrypted PDF (`-sUserPassword=secret123`, 8 pages,
  RC4) where the correct password is known — wrong password rejected first,
  then the correct password unlocked, processed, and rendered all 8 pages
  correctly. This also caught and fixed a real backend bug: a PDF requiring
  an *open* password (not just an owner/permissions password) makes
  `pdfinfo` exit non-zero with "Incorrect password" even before any password
  is supplied, which the original code mistook for corruption; it's now
  correctly detected as `password_protected` by checking for that specific
  stderr message before falling back to "corrupted".
- **Corrupted PDF** (a truncated copy of a real PDF): real, clear rejection
  at upload time — "could not be read as a PDF — it may be corrupted" — no
  crash, upload dialog stays open for another try.
- **Unsupported file type** (a PNG renamed to `.pdf`): rejected by the real
  `finfo` content sniff despite the `.pdf` extension and a spoofed
  multipart `Content-Type`.
- **Oversized PDF**: `DOCUMENTS_MAX_UPLOAD_MB` temporarily lowered to 5 in
  `.env`, a 12MB file rejected with a clear real error, config restored to
  100 afterward and reconfirmed.
- **Scanned/image-only PDF** (synthesized via `pdftoppm` + `img2pdf`, zero
  extractable text): renders and thumbnails correctly like any other PDF;
  the search box honestly shows "No searchable text in this document" and is
  disabled, rather than silently returning zero matches indistinguishable
  from "found nothing."
- **Original-file-untouched guarantee**: `sha256sum` of the stored original
  matched the source file's checksum exactly, checked both immediately after
  upload and again after the thumbnail job completed.
- Zero browser console errors across every scenario above.
