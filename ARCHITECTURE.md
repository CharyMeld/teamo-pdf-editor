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

## Phase 3 (backend) — real PDF page-management engine (2026-09-15)

ORGANIZE's ten page operations are now real, against a real "working copy" —
the state the document state model named at Phase 0 and deliberately left
unimplemented until an editing module had actual logic. **Backend only** —
no frontend work in this phase; the ribbon's ORGANIZE commands stay
`"unavailable"` in the registry until the frontend half wires them up.

### Engine choice

- **`qpdf`** (newly installed this phase — was intentionally absent through
  Phase 0–2, see the engine table) is the primary tool, via its `--pages`
  composition primitive: `qpdf --empty --pages FILE1 RANGE1 FILE2 RANGE2 -- OUT`
  builds an output from arbitrary page ranges of one or more source files, in
  any order, with repeats allowed. One primitive covers delete (omit a page),
  reorder (list pages out of order), duplicate (list a page twice), extract
  (list only wanted pages), split (call it once per range), merge (pull pages
  from a second file), insert (splice another file's pages into a range list),
  and replace (omit the old page, splice in a replacement). Rotation combines
  into the same invocation via `--rotate=+90:pageNumber` (relative to the
  page's *existing* rotation — confirmed empirically that `/Rotate` carries
  forward file-to-file, so no separate rotation bookkeeping is needed; each
  step's output becomes the next step's input).
- **Ghostscript (`gs`)**, already on the host, handles the one thing qpdf's
  CLI has no primitive for: crop. A page is first extracted alone (via qpdf),
  then Ghostscript rewrites its MediaBox with
  `-dUseCropBox -dDEVICEWIDTHPOINTS=<w> -dDEVICEHEIGHTPOINTS=<h> -dFIXEDMEDIA`
  plus a `PageOffset` PostScript directive, producing an exact-size cropped
  single page that's spliced back in via qpdf. Verified empirically (a
  200×300pt crop request produced exactly a 200×300pt output page, confirmed
  via both `pdfinfo -box` and rendering to a 200×300px image at 72 DPI) before
  being wired into the real endpoint.
- Every invocation runs through Laravel's `Process` facade with an argument
  array — never a shell string — so page numbers/paths can't be interpreted
  as shell syntax. qpdf's exit code **3** ("succeeded with warnings" — e.g.
  minor cross-reference quirks in the *source* file) is treated as success,
  not failure; only exit code 2 or an unstartable process is a real error —
  confirmed necessary against several of the real test PDFs, which qpdf
  processed correctly while still emitting warnings.

### Working-copy / undo-redo model

New table `document_edit_operations` (`App\Models\DocumentEditOperation`,
owned by the Editing module): one row per applied operation, holding the
*real PDF snapshot* it produced (`resulting_storage_path`) plus its type,
JSON payload, and resulting page count. `documents` gained two pointer
columns: `current_step_id` (null = no pending edits — the working state IS
the base version) and `base_version_id` (which saved version an editing
session started from).

- **Undo/redo is just moving the pointer** through the operation chain — no
  separate "undo log", the chain itself *is* the undo history, and each step
  is a real, independently-inspectable PDF file (verified throughout testing
  by running `pdfinfo`/`pdftotext`/`qpdf --show-npages` directly against each
  step's file, never by trusting the API's JSON response).
- **Redo-branch pruning**: applying a new operation while the pointer isn't
  at the tip deletes both the DB rows *and* the on-disk files for every step
  ahead of it first — exactly a text editor's undo-stack semantics. Verified:
  3 operations → undo ×2 → redo ×1 → a new 4th operation correctly discarded
  the original 3rd step (file and row both gone) and made redo unavailable
  again.
- **Thumbnails for a working step are always a queued job**
  (`App\Jobs\GenerateWorkingThumbnails`, reusing
  `DocumentThumbnailRenderer`'s per-page rasterization core via a new
  `renderWorkingStep()` method — refactored out of the Phase 2 `render()`
  method rather than duplicated), never inline. Timing measured directly
  against the 261-page test file: the qpdf/Ghostscript step itself completes
  in **under 1.1 seconds** even at that scale, but thumbnail rasterization
  runs at roughly 0.4–0.8s/page — for 261 pages that's minutes, which would
  time out an HTTP request. A working step's page geometry/thumbnails are
  stored as a JSON array on `document_edit_operations.pages_snapshot`, *not*
  as `document_pages` rows — `document_pages` stays scoped to *saved*
  versions only (see the Pages module's updated `MODULE.md`), keeping the
  two states unambiguous.
- `GenerateDocumentThumbnails` (Phase 2) previously hardcoded
  `version_number = 1` — harmless when only one version could ever exist,
  but wrong now that Save creates real new versions. Fixed to take an
  explicit `versionId`; the one existing call site (upload) updated
  accordingly. Caught by design review before it could cause a real bug in
  Save's regenerated thumbnails.

### Save / Save As

- **Save** (`POST /documents/{id}/save`) copies the current working file into
  a new `document_versions` row (`versions/{n}/document.pdf`), flips
  `is_current`, resets the working-copy pointer to null, and dispatches the
  normal Phase 2 thumbnail job against the new version. Verified: the new
  version's `checksum_sha256` matched a fresh `sha256sum` of the working
  file exactly, and — the critical guarantee — version 1's file was still
  byte-identical to the original source PDF after 9 real edits and a save
  (**"keep the original file untouched"**, actually checked, not assumed).
- **Save As** (`POST /documents/{id}/save-as`) wraps the current working
  state as version 1 of a brand-new, independent `Document` (shares a
  `createDocumentFromFile()` helper with Extract/Split — see below).
  Verified the source document's own pending edit (an uncommitted rotate)
  was completely unaffected by a Save As of its current state — confirmed
  by checking `current_step_id` was unchanged before/after.
- **Deliberate behavior, not a bug**: Save prunes the *entire* pre-save
  operation chain (its content is now durably captured in the new version,
  so the old step files are redundant) — meaning undo does not reach back
  across a Save. This falls directly out of the "pointer at 0 after Save ⇒
  everything ahead of 0 is pruned" rule already needed for redo-branch
  cutting; it was not special-cased, and is consistent with the documented
  state model (the working copy *becomes* the new version on Save, it
  doesn't coexist with it).
- Both endpoints correctly reject a no-op case with a clear error rather
  than a silent success: Save with no pending edits →
  *"There are no pending changes to save."*; Undo/Redo with nothing to
  undo/redo → equivalent clear errors. All three verified against the live
  API, not inferred.

### The ten operations (all real, all endpoint-tested against live output)

| Operation | Endpoint | Mutates working copy? |
|---|---|---|
| Insert | `POST .../operations/insert` (blank page or an uploaded PDF's pages) | Yes |
| Delete | `POST .../operations/delete` | Yes |
| Reorder | `POST .../operations/reorder` (full permutation) | Yes |
| Duplicate | `POST .../operations/duplicate` | Yes |
| Rotate | `POST .../operations/rotate` (±90/180/270) | Yes |
| Crop | `POST .../operations/crop` (bottom-left-origin PDF-point box) | Yes |
| Replace | `POST .../operations/replace` (a page from an uploaded PDF) | Yes |
| Merge | `POST .../operations/merge` (another owned, ready document, before/after) | Yes |
| Extract | `POST .../operations/extract` | **No** — produces a new sibling `Document` |
| Split | `POST .../operations/split` (multiple `[start,end]` ranges) | **No** — produces multiple new `Document`s |

Every mutating operation validates page references against the document's
**real current page count** (from the working-copy pointer, not a cached
value) before touching qpdf/Ghostscript, and returns
`{operationId, sequenceNumber, pageCount, thumbnailJobId, status, canUndo,
canRedo}`. `GET .../working/pages` and
`GET .../working/pages/{n}/thumbnail` expose the current working state
(falling back to the base version's real `document_pages` when there are no
pending edits yet).

Each operation was verified against its **real output file**, not the API's
own claims — representative examples actually run during this phase:

- **Delete** page 5 of 8 → confirmed 7 pages, and (via `pdftotext` per-page
  fingerprints) that the old page 6's content is now at position 5 and the
  old page 5's text no longer appears anywhere in the document.
- **Reorder** `[7,6,5,4,3,2,1]` → confirmed each output page's real text
  matches the expected original page, fully reversed.
- **Rotate** +90° → confirmed via rendering to an image that width/height
  swapped exactly as a real 90° rotation requires (414×585 → 585×414).
- **Duplicate** page 2 → confirmed pages 2 and 3 have byte-for-byte identical
  extracted text.
- **Crop** a 200×300pt box at offset (50,50) → confirmed the resulting page's
  real `pdfinfo` size is exactly 200×300pt, other pages untouched.
- **Merge** a second (1-page) document *after* → confirmed page count +1 and
  the new last page's real text matches the merged-in document exactly.
- **Insert** a blank page at the start → confirmed page 1 has no extractable
  text and the correct real dimensions, and every later page shifted down by
  one with its content intact.
- **Insert from upload** at position 3 → confirmed the inserted page's real
  content matches the uploaded source and surrounding pages shifted
  correctly.
- **Replace** page 5 with an uploaded page → confirmed the old page 5's
  fingerprint text is gone and the new content is in its place; pages 4 and 6
  unaffected.
- **Extract** pages `[1,3]` → confirmed the new document's page 1 and 2 real
  content matches source pages 1 and 3 respectively, in that order.
- **Split** into `[1,4]` and `[5,9]` → confirmed two new independent
  documents with 4 and 5 real pages respectively (summing to the source's 9),
  and the source document's own working pointer was unaffected by either.
- **At 261-page scale**: delete page 150 → confirmed exactly 260 pages and
  that the real text of the old page 151 is now at position 150
  (character-for-character match); the qpdf step completed in ~1 second.

### Error handling (all verified against the live API, real rejections)

- Out-of-range page numbers, an invalid reorder permutation (not a true
  1..N permutation), a rotation not in `{90, 180, 270, -90}`, a crop box
  exceeding the page bounds, and an operation that would delete every
  remaining page all return a clear `422` with a specific message — and,
  confirmed via direct DB inspection, **create no orphan
  `document_edit_operations` row and no stray file** on rejection.
- Editing is refused with *"This document is not ready for editing yet."*
  whenever `documents.status !== 'ready'` — including the real window right
  after upload, before the initial thumbnail job completes, when
  `page_count`/`document_pages` aren't trustworthy yet. The same rule gates
  Merge's *other* document (must itself be `'ready'`, not merely
  `'processing'`), confirmed by attempting a merge immediately after
  uploading the other file.
- Merge/ownership boundaries are real, not cosmetic: merging against a
  document owned by a different (test-seeded) user, and against a
  nonexistent document UUID, both correctly return
  *"...not found, not owned by you, or not ready."*; directly fetching
  another user's document returns a real `403`.
- Insert/Replace source files go through the same real validation as a
  top-level upload (content-sniffed MIME via `finfo`, then a `pdfinfo`
  structural check) — verified by disguising a PNG as `.pdf` (rejected at
  Laravel's `mimes:pdf` request-validation layer) and by truncating a real
  PDF's header (passed the extension/MIME check but correctly rejected by
  the `pdfinfo` structural check with *"not a valid single-source PDF"*).
  An out-of-range `replacementPage` against a real single-page upload is
  rejected the same way.

### A real bug found and fixed during this phase's own testing

`WorkingCopyManager::cleanupScratchDir()` computed the scratch-directory
prefix as `Storage::disk('temp')->path('') . DIRECTORY_SEPARATOR` — but
`path('')` already returns the disk root *with* a trailing slash, so the
extra separator produced a double-slash needle that never matched inside
`Str::after()`. `Str::after()` silently returns its input unchanged when the
needle isn't found, so `deleteDirectory()` was being called with a full
absolute path where a disk-relative one was expected — a silent no-op.
Caught by directly inspecting `storage/app/private/temp/edit-scratch/` after
roughly twenty real operations and finding ~18 orphaned directories instead
of zero. Fixed by dropping the redundant separator; re-verified across
several more successful *and* intentionally-failing operations that the
directory is now empty after every single one.

### Infrastructure note (not a code change)

`php artisan serve`'s spawned PHP built-in server does not forward `-d` ini
overrides passed to the outer `artisan serve` command — discovered when
testing the 261-page/8.9MB file against the default `upload_max_filesize=2M`/
`post_max_size=8M` returned a real `413`. Worked around for testing by
running `php -d upload_max_filesize=110M -d post_max_size=120M -S
127.0.0.1:8000 -t public` directly. This is a genuine **production/deployment
requirement**, not a Phase 3 code concern: whatever serves this app for real
(php-fpm + nginx/Apache) must set `upload_max_filesize`/`post_max_size` in
its actual `php.ini` to comfortably exceed `DOCUMENTS_MAX_UPLOAD_MB`
(currently 100MB) plus multipart overhead — Laravel's own validation rule is
not sufficient on its own if the webserver rejects the request first.

### What Phase 3 (backend) does NOT include

The frontend — no ORGANIZE ribbon wiring, no page-thumbnail selection UI, no
drag-and-drop, no undo/redo buttons, no Save/Save As dialogs (all planned for
Phase 3's frontend half). No OCR, conversion, compression, signing, AI, forms,
or annotations. No real login/register UI (same dev-auth-shortcut caveat as
Phase 2). Content-level editing (text/image edits within a page) is out of
scope for every phase so far — Phase 3 is page-structure operations only.

## Phase 3 (frontend) — ORGANIZE page-management UI (2026-09-15)

Wires the real ORGANIZE tab, thumbnail-panel selection/drag-and-drop, and
Save/Save As/Undo/Redo to the Phase 3 (backend) API above. No new backend
endpoints — one narrow, necessary backend fix, see "A real bug" below.

### Selection model

`usePageSelection` (a new provider, nested inside `WorkingDocumentProvider`
in `WorkspaceProviders`) holds the real selected-page set: plain click
selects one page, Ctrl/Cmd+click toggles a page into/out of a multi-
selection, Shift+click selects the contiguous range from the last-clicked
page. Selecting one or more pages sets `useSelectionContext`'s
`SelectionType` to `"page"` — the same mechanism Phase 1's dev-only
simulator used to fake; the simulator's "Page" option is removed (see
`DevSelectionSimulator.tsx`) since a real input source exists now. Selection
is cleared on a document switch and whenever `useWorkingDocument`'s new
`revision` counter changes (bumped only by an operation that actually
mutates the working copy's page structure — delete/reorder/duplicate/
rotate/crop/insert/replace/merge/undo/redo — never by a routine thumbnail-
poll tick) — page numbers can mean something different after a structural
edit, so keeping a stale selection would be wrong.

### Working-document state (`useWorkingDocument`)

A new provider (nested inside `OpenDocumentProvider`) owning: the working
copy's real page list (polled from `GET .../working/pages`, whose `pending`
flag — not documented in the backend's own report table, found by hitting
the live endpoint as instructed — drives a "thumbnails updating" indicator),
`canUndo`/`canRedo`, a `busy`/`busyLabel` flag that disables every ORGANIZE/
Save/Undo/Redo command for the duration of any in-flight operation (reusing
Phase 1's existing `disabledReasons` mechanism — no new primitive needed),
and a `notice` channel (success/error, auto-dismissing) surfaced in
`StatusBar`. One real limitation, not an oversight: `GET .../working/pages`
doesn't expose `canRedo` (only operation/undo/redo responses do), so
reopening a document with a pre-existing pending edit shows `canUndo` true
but `canRedo` false until the user's own next action establishes real redo
state — acceptable since redo across a session reload was never guaranteed
by the backend's own model either.

### Thumbnail panel: real selection + drag-and-drop reordering

`ThumbnailPanel`/`ThumbnailItem` now source pages from
`useWorkingDocument` (which itself follows the backend's `source: "step" |
"version"` fallback) instead of the Phase 2 version-only list, show a real
selected-state ring, and implement genuine HTML5 drag-and-drop: dragging a
thumbnail to a new position computes the exact permutation of current page
numbers via `computeNewOrder()` and calls the real reorder endpoint — this
is the literal "dragging page 8 before page 3 must actually change the PDF
page order" requirement, verified against the real output file's per-page
text fingerprints, not just the drop landing visually. Drag is disabled
while an operation is in flight.

### ORGANIZE commands, contextual page commands, dialogs

`commands/registry.ts`'s ORGANIZE tab and `CONTEXTUAL_COMMANDS.page` flip
from `"unavailable"` to `"available"` (the second and third batches to flip,
after Phase 2's `home.open`), plus new commands for insert/duplicate/split/
replace/crop that Phase 1 hadn't stubbed. `hooks/useOrganizeRunHandlers.ts`
builds the real `runHandlers`/`disabledReasons` maps consumed by
`CommandRibbon`, `ContextualCommandGroup` (now accepts these props), and
`AppHeader`'s command search — one source of truth so "rotate" is runnable
identically from the ribbon, the contextual group, or typing it into search.
Operations needing more than "the current selection" get a real dialog
(`components/dialogs/{Insert,Replace,Merge,Split,SaveAs,Crop}PageDialog.tsx`
— naming approximate, see actual filenames): Merge lists the user's other
`ready` documents via the existing `GET /api/documents`; Crop renders the
actual target page into a preview `<canvas>` via the same pdf.js document
Phase 2 already loaded, and lets the user drag a real rectangle whose pixel
coordinates convert to PDF points (bottom-left origin, matching the
backend's contract exactly) — both the drag overlay and the numeric x/y/
width/height fields are two live views of one canonical state, not a
placeholder overlay with no effect.

### Undo/Redo

Real Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z (also Ctrl+Y) keyboard shortcuts
(`CommandRibbon`'s `useUndoRedoShortcuts`, skipped while focus is in a text
input). `edit.undo`/`edit.redo` (Phase 1 stubs) flip to available too, but
the primary, always-reachable path is a new persistent Undo/Redo button
pair in `AppHeader` (`HistoryControls`) — deliberately NOT tab-gated,
because page-operation history is a workspace-wide concept a user shouldn't
have to switch to the EDIT tab to reach, matching the keyboard shortcut's
own tab-independent availability. This was a design decision made during
this phase, not specified verbatim by the brief, which said "in the ribbon's
HOME or a dedicated area."

### Save / Save As

`home.save` calls the real save endpoint when `canUndo` is true; when false
it shows a local "no changes to save" notice without a network round-trip
(the backend's own equivalent rejection is still the authoritative source
of truth for a race where `canUndo` goes stale — this is just an optimistic
UI courtesy). `home.saveAs` opens a real title-prompt dialog; on success the
notice includes a real "Open" action wired to `useOpenDocument.openExisting`
so the user can jump to the new document without losing their place in the
current one. Extract/Split follow the identical success-notice-with-Open-
action pattern for their new document(s).

### A real bug found and fixed during this phase's own testing (backend, one file)

This phase was instructed not to touch the backend. One narrow exception was
made, and is called out explicitly here rather than folded in quietly:
`GET /api/health` was included in `statefulApi()`'s global middleware
(`bootstrap/app.php`), meaning every hit — including `StatusBar`'s
`checkHealth()`, which fires immediately on mount, independent of and not
awaiting the `devSessionReady` bootstrap — started/touched a session. When
that health check's session-touching response landed between the CSRF-
cookie fetch and `/api/dev/login` (a real race under real, if unusual,
network/timing conditions — reproduced consistently during this phase's
browser-driven testing, not a test-harness artifact: confirmed via direct
cookie-jar inspection that the browser could end up holding a session
cookie from a *different* server-side session than the one its XSRF token
belonged to), the very next authenticated request failed with a genuine,
intermittent `401`/`419` — reproducible by any user who interacts within
roughly a second of page load, not just this test's synthetic timing. Fixed
by excluding `/api/health` from `EnsureFrontendRequestsAreStateful`
(`Route::get('/health', ...)->withoutMiddleware(EnsureFrontendRequestsAreStateful::class)`
in `routes/api.php`) — a pure health check has no legitimate reason to touch
sessions at all, so this removes the race at its root rather than papering
over it with client-side sequencing. Verified: `/health` no longer sets
`Set-Cookie`, and the previously-flaky upload→ready flow passed cleanly and
repeatedly afterward.

### Testing

Driven against the real running stack (`php -S` + `queue:work` + `vite dev`)
via a Chrome DevTools Protocol script (no new dependencies), the same
technique Phases 1-2 used — real clicks, real Ctrl/Shift+click modifiers,
real synthetic `DragEvent`s with a real `DataTransfer`, real file uploads
via a `File`+`DataTransfer` assignment to the hidden `<input>`. Verified via
a combination of DOM assertions, real (non-preflight) network-request
capture, and direct inspection of the resulting backend files/database rows
— not the API's JSON responses alone. Covered for real: upload→ready,
single/multi/range thumbnail selection, contextual ribbon reacting to
selection, rotate (confirmed via real page-dimension swap in
`working/pages`), delete (confirmed via real thumbnail-count and page-count
drop), undo/redo (confirmed via `source` flipping between `"version"`/
`"step"` and rotation state reverting/reapplying), drag-and-drop reorder
(confirmed via a real `operations/reorder` call), Save (confirmed via a new
`document_versions` row and the source's own pending-edit pointer
resetting), Save As (confirmed via a genuinely new, independent `documents`
row), Merge (confirmed via real pending page count increasing by the merged
document's page count), and a real `422` from an intentionally invalid
operation surfacing its specific backend message end-to-end rather than a
generic or silent failure. This environment runs on a shared, actively-used
desktop (the user's own browser, video playback, and other applications
running concurrently) rather than an isolated CI box, which measurably
affected automated-test timing (documented, not hidden) — where a fixed
delay proved unreliable, verification was redone against polling that waits
for the real settled state (via the backend's own `pending` flag and
`source` field) rather than a guessed sleep duration.

### What Phase 3 (frontend) does NOT include

EDIT/ANNOTATE/OCR/CONVERT/COMPRESS/SIGN/AI tab functionality (still
correctly `"unavailable"` — only ORGANIZE, HOME's `open`, and the Save/
Save-As/Undo/Redo commands are real as of this phase). No full document-
management UI beyond the minimal "pick a document to merge with" / "open
the document that just got extracted/split/saved-as" affordances described
above — that's Phase 13 per the user's own roadmap. No backend changes
beyond the one documented health-check middleware fix.

## Phase 4 (backend) — real PDF content-editing engine (2026-09-15)

EDIT's TEXT/IMAGE/OBJECT commands are now real, against the same "working
copy" Phase 3 built — content edits are just another kind of
`document_edit_operations` step, so undo/redo/Save/Save As all work
identically without any new mechanism. **Backend only** — no frontend work
this phase; the ribbon's EDIT commands stay `"unavailable"` until the
frontend half wires them up.

### Honest scope boundary — read before extending this

True in-place editing of arbitrary pre-existing PDF text (reflowing an
existing sentence's own content-stream operators, arbitrary real-world fonts/
encodings) is not reliably achievable with the tools available, and the
user's own brief explicitly anticipated this ("where a PDF's underlying
structure prevents direct modification, implement a technically sound
overlay/editing strategy and clearly distinguish it from true source-content
modification"; "duplicate where technically supported"). The real, honest
scope implemented:

- **Add text** — TRUE new PDF content: real font/size/bold/italic/color/
  alignment/line-spacing, composed into the actual page content stream via
  FPDI/FPDF. Verified genuinely extractable via `pdftotext` (not a raster
  picture of text).
- **Edit text** — a real, explicitly-tagged **overlay edit**
  (`type: "text_overlay_edit"`): a background-matching rectangle covers the
  original text's bounding box, with new real text drawn on top. Clearly
  distinct in the data model from `type: "text"` (true new content) — never
  conflated.
- **Insert image** — a TRUE new embedded image XObject (verified via
  `pdfimages -list`), not a flattened screenshot.
- **Image select/move/resize/rotate/delete/duplicate** — fully real, but
  ONLY for images this system itself inserted (it knows their exact
  parameters). Manipulating a PRE-EXISTING image already embedded in the
  original PDF (parsing and rewriting an unknown foreign content stream's
  placement matrix) is explicitly **out of scope** — not attempted, not
  faked. This module only ever manages objects it created.
- **Objects (select/move/resize/delete/duplicate)** — applies uniformly to
  the text/image objects this system manages, satisfying "duplicate where
  technically supported" honestly.
- **Preserve original content wherever possible** — every recomposition
  rebuilds each page from the document's true clean page-structure state
  (never stacks overlay-on-overlay), and version 1 (the original upload) is
  never touched by any Phase 4 operation — reverified via `sha256` after a
  sequence of ten real content/page operations and a Save.

**Deliberate, documented limitation**: once a page-structural operation
(rotate/crop/delete/reorder/...) runs on top of a working state that has
active content objects, those objects' real pixels/text become permanently
part of the page from then on (qpdf carries real content through correctly —
verified: a `REPLACED HEADER TEXT` overlay edit and other content survived a
subsequent page-5 rotate operation intact), but they stop being independently
selectable/movable/deletable as objects — the next content operation starts a
fresh, empty object chain from that new clean point. Analogous to
"flattening" in other editors; an intentional scope boundary, not an
oversight.

### Engine

`setasign/fpdi` + `setasign/fpdf` (both free/open-source, no commercial
license) — FPDI imports each existing page as a template (its real content,
untouched); FPDF draws new text/images on top with real parameters.
Constructed with unit `'pt'` (`new RotatingFpdi('P', 'pt')`) so every
coordinate is a direct PDF point with no conversion layer — `k = 1`
internally, confirmed against FPDF's own source. Available fonts: FPDF's
three core fonts only — **Helvetica** (Arial accepted as an alias),
**Times**, **Courier** — no embedding-rights concerns; an unknown font name
is rejected with the available list in the error message.

`App\Domain\Editing\Services\RotatingFpdi` extends FPDI with the standard,
well-known FPDF rotation technique (a `q ... cm ... Q` content-stream block
around each rotated object, pivoting on its own center) — real PDF
content-stream manipulation via the `cm` operator, not a raster trick.

### A real bug found and fixed during this phase's own testing

FPDF's `SetFont()`/`SetFontSize()` silently skip re-emitting the `Tf` (font
selection) operator whenever their internally cached family/style/size
already match the request — a correct optimization for FPDF's own normal,
single continuous document flow. But `RotatingFpdi`'s raw `q`/`Q` rotation
wrapping can revert the PDF graphics state (which text-state parameters,
including the selected font, are part of per PDF spec §9.3) **underneath**
that cache, with no way for FPDF to know. Without a fix, a second object
using the identical font/size as a previous one on the same page got no font
selected inside its own `Tj` show operator — a real corrupt PDF, caught via
`pdftotext`: `"Syntax Error: No font in show"`, and confirmed at the
raw-content-stream level (`qpdf --qdf`) showing the `Tf` operator emitted
once, outside the text-showing block it was needed in, then silently skipped
for the second object entirely. Fixed by `RotatingFpdi::resetFontCache()`,
called immediately before every `SetFont()` in `PdfContentEngine::drawText()`
— forces FPDF to always freshly re-emit the font selection inside each
object's own graphics-state bracket. Re-verified with two non-rotated
same-font objects (isolating the fix from the rotation case): both now
extract cleanly and separately via `pdftotext`, and the original rotated
repro case renders two fully legible, independently-styled rotated text
objects with `qpdf --check` reporting no errors.

Also fixed in the same pass: FPDF's default `AutoPageBreak` (an
unwanted document-flow feature for a tool doing manual absolute-position
placement on pre-existing pages) is now explicitly disabled
(`SetAutoPageBreak(false)`) before composing, avoiding a class of
silent extra-page-insertion bugs from ever being possible.

### Recomposition model

Reuses Phase 3's `document_edit_operations` step/pointer chain exactly — no
new table, no new model. Each content mutation (add, update, delete,
duplicate) is committed as a new step via the existing
`WorkingCopyManager::commitStep()`, whose `payload` JSON now also holds, for
content-type steps:

- `contentObjects` — the full current object list for the whole document,
  including inactive (soft-deleted) entries, so undo can resurrect one for
  free just by the pointer moving back — no special-case resurrection code
  needed, verified via undo bringing a deleted object visibly back.
- `sourceStepId` / `sourceVersionId` (exactly one set) — the "clean"
  page-structure state (no content objects of its own baked in) every
  content step in a chain recomposes from, every time, so objects never
  stack/ghost. When the current step is itself a content step, a new
  mutation inherits *its* source (not its own output file); when the
  current step is a page operation (or there is no step), that state is
  clean by definition and becomes the new chain's base with an empty
  object list — confirmed via direct payload inspection
  (`sourceStepId` correctly pointed at the page-op step, `contentObjects`
  correctly started at a single fresh entry) after interleaving a Phase 3
  rotate between two content edits.

`WorkingCopyManager::resolveAbsolutePath(?stepId, ?versionId)` — the one
small, additive extension Phase 4 needed on Phase 3's manager — resolves
either reference to an absolute file path.

Thumbnail regeneration for a content step is unchanged from Phase 3 — it's
just another `commitStep()` call, so `GenerateWorkingThumbnails` fires
automatically with no Phase 4-specific code.

### API

All under `/api/documents/{uuid}/content/objects`, `auth:sanctum`, same
`{operationId, sequenceNumber, pageCount, thumbnailJobId, status, canUndo,
canRedo}` envelope as Phase 3's operations plus an `objectId`:

| Method | Path | Body |
|---|---|---|
| GET | `/content/objects?page={n}` | — (page optional) → `{data: [...], availableFonts: [...]}` |
| POST | `/content/objects` | `{type: 'text'\|'text_overlay_edit'\|'image', page, x, y, width, height, rotation?, zIndex?, params, file?}` (multipart when `type: 'image'`) |
| PATCH | `/content/objects/{objectId}` | any of `x, y, width, height, rotation, zIndex, params` (partial — merges into the existing object) |
| DELETE | `/content/objects/{objectId}` | — (soft-deactivates; undo-able) |
| POST | `/content/objects/{objectId}/duplicate` | — (clones with a +12pt offset, new id) |

Coordinates: bottom-left-origin PDF points, the same convention Phase 3's
crop feature established. `text`/`text_overlay_edit` params: `text, font,
fontSize, bold, italic, color (#RRGGBB), align (left/center/right/justify),
lineSpacing`; `text_overlay_edit` additionally requires
`coverOriginal: {x,y,width,height}` and accepts `coverColor` (default
white). `image` objects are normalized to PNG server-side (via GD) at
upload time regardless of source format (PNG/JPEG/GIF/WebP/BMP accepted,
validated by real `finfo` content sniff, not extension), guaranteeing FPDF
compatibility; the disk path is never exposed to the client — only
`originalFilename`.

### Verified working (2026-09-15)

All against the live `php artisan serve` + `queue:work` stack, using
`curl` with a real cookie-jar-carried Sanctum session (the same dev-login
flow the SPA uses) against the real 8-page test PDF, with every claim
checked against the actual output file (`pdftotext`, `pdfimages -list`,
`pdftoppm` render + visual inspection, `pdfinfo`, `qpdf --check`), never the
API's JSON response alone:

- **Add text**: real, extractable, styled (bold, red) text landed exactly
  at the specified position; original page content fully intact underneath.
- **Move/restyle/rotate** (single `PATCH`): position, color (red→blue),
  style (upright→italic), and a real 15° rotation (genuine `cm`-matrix
  transform, confirmed visually tilted) all applied correctly in one call,
  with the old (red, unrotated) state completely gone — no ghosting.
- **Delete**: text genuinely absent from `pdftotext` output afterward.
- **Undo** after delete: correctly restored to the pre-delete (moved/
  rotated) state.
- **Duplicate**: two independently-editable copies, offset by 12pt — this
  is what surfaced and got fixed the font-cache bug above; re-verified
  clean after the fix (both instances fully legible in the rendered image,
  `qpdf --check` reports no errors, and a follow-up non-rotated same-font
  pair both extract separately via `pdftotext`).
- **Redo-branch pruning**: applying duplicate from a non-tip pointer
  correctly discarded the abandoned step (row and file both gone) — the
  exact same mechanism Phase 3 already proved, now exercised by a content
  operation for the first time.
- **Insert image**: a real 120×80 RGB PNG XObject (confirmed via
  `pdfimages -list`) rendered correctly on the target page.
- **Image move/resize/rotate**: repositioned, resized to 180×120, and
  rotated 30° in one `PATCH` — old position/size fully gone, no ghosting.
- **Image delete**: confirmed gone via `pdfimages -list`, while a
  pre-existing image already in the original document (same dimensions/
  size as the unedited source file's own baseline) correctly remained.
- **Overlay text edit**: a real white redaction rectangle plus real
  replacement text (`pdftotext`-extractable) landed exactly as specified.
- **Undo/redo interleaved with a real Phase 3 page operation**: rotated
  page 5 via the existing `/operations/rotate` endpoint on top of five
  content edits, confirmed the content edits survived intact (baked into
  the page, per the documented scope boundary) and the rotation applied
  correctly (verified both via `pdfinfo`'s page-rotation field on the
  step right after the qpdf rotate, and via a visual render after FPDI
  re-imported it — the rotation persists correctly through FPDI's import
  even though it's represented differently afterward: baked into the
  page's own dimensions/content rather than carried as a separate
  `/Rotate` flag, standard correct FPDI behavior, confirmed by rendering
  the page and visually checking the content reads correctly oriented).
  A further content edit after the page op correctly started a fresh
  object chain from that point (`sourceStepId` pointed at the rotate
  step, `contentObjects` started empty) — the documented scope boundary
  working exactly as designed, not silently losing prior edits (their
  pixels remained, confirmed via `pdftotext` still finding the earlier
  overlay-edited text) while correctly not treating them as live objects
  going forward.
- **Save**: the new `document_versions` row's stored file, freshly
  re-inspected from disk (not the working step), genuinely contains every
  content edit and the page rotation; its `checksum_sha256` matches a
  fresh `sha256sum` of the file exactly.
- **Original-untouched guarantee**: version 1's file remained byte-for-byte
  identical (`sha256sum`) to the original source PDF after ten real
  content/page operations and a Save.
- **Post-Save chain reset**: a content edit performed after Save correctly
  started at `sequenceNumber: 1` again — Phase 3's existing "Save prunes
  the pre-save chain" behavior applies to content operations for free,
  no special-casing needed.
- **Error handling**: an unknown font, an invalid hex color, a `PATCH`/
  `DELETE` against a nonexistent or already-inactive `objectId`, and a
  non-image file uploaded as `type: 'image'` (rejected by Laravel's own
  `image` validation rule) all returned clear, specific `422`s — confirmed
  via direct DB inspection that none of these failures created an orphan
  `document_edit_operations` row.
- **Out-of-range page number**: rejected with the same clear message format
  Phase 3's page operations already use.
- `php artisan route:list`: all five Phase 4 routes registered correctly.
- Zero warnings or errors in the backend/queue logs across the entire test
  session (roughly a dozen real operations, several dispatched thumbnail
  jobs, and the intentional error-case requests).

### What Phase 4 (backend) does NOT include

The frontend — no EDIT ribbon wiring, no selection handles, no drag/resize/
rotate UI, no text/font toolbar, no crop-style drag-to-place interaction for
new objects (all planned for Phase 4's frontend half). True in-place editing
of pre-existing PDF text content, and manipulation of images already
embedded in the original document (see the honest scope boundary above) —
neither is planned for any future phase without a specific, scoped decision
to attempt the significantly harder content-stream-parsing work that would
require. No OCR, conversion, compression, signing, AI, forms, or
annotations. No real login/register UI (same dev-auth-shortcut caveat as
prior phases).

### Unrelated, pre-existing finding (not fixed, out of scope)

`composer audit` reports a `laravel/framework` advisory (CRLF injection in
the default email validation rule, GHSA-5vg9-5847-vvmq) — pre-existing in
the framework version installed at Phase 0, unrelated to anything Phase 4
touches (this app has no email-validated user input yet), and not a
regression introduced by installing `setasign/fpdi`/`setasign/fpdf`. Left
for a dedicated framework-upgrade decision rather than bundled into this
phase's scope.

## Phase 4 (frontend) — real content-editing UI (2026-09-17)

Wires the EDIT ribbon and Smart Inspector to Phase 4 (backend)'s content-
object API above. No backend endpoint changes — one frontend request-shape
bug against the existing contract, see "Real bugs" below.

### Provider and canvas mount

`ContentObjectsProvider` (`content-editor/useContentObjects.tsx`) joins
`WorkspaceProviders`, nested inside `WorkingDocumentProvider` (needs
`useWorkingDocument.applyOperationResult`) and wrapping `PageSelectionProvider`.
It fetches the *current page's* active objects (`GET .../content/objects?page=`)
whenever the open document, current page, or `useWorkingDocument.revision`
changes, and exposes placement mode, the selected object, and one mutating
call per backend operation (create text/overlay-edit/image, patch, delete,
duplicate) — each routed through a shared `runMutating()` that applies the
returned `OperationResult` via `useWorkingDocument.applyOperationResult`
(new, extracted from that hook's existing mutating-wrapper so Phase 4's
content mutations share the exact same Undo/Redo/thumbnail-poll path Phase
3's page operations use, rather than a second parallel mechanism) and
re-fetches the object list.

`ContentObjectLayer` mounts as an absolutely-positioned sibling on top of
the pdf.js `<canvas>` for whichever page is currently viewed (`PdfViewer`),
using the same bottom-left-origin PDF-point ↔ screen-pixel conversion
Phase 3's `CropDialog` established. It renders every active object as a
selectable/draggable/resizable/rotatable overlay (four corner handles plus
a rotate handle when selected), and implements the click-and-drag
placement gesture for a new text/overlay-edit/image object — drawing a box
either opens `TextComposerPopover` (text/overlay-edit) or opens a hidden
file input via a `filechooser`-style click (image).

### Text styling and Smart Inspector panels

`TextStyleFields` (font/size/bold/italic/align/color/line-spacing) is
shared verbatim between `TextComposerPopover` (placement-time) and the new
`TextObjectPanel`/`ImageObjectPanel` (post-creation editing, replacing the
Phase 1 dev-stub `SelectionPanel` for `selection: "text" | "image"` —
`SelectionPanel` itself now only renders for `"annotation"`, the one
selection type still real-canvas-less pending Phase 5). Style toggles
(bold/italic/align/font/color) commit immediately on change; free-text
fields (the text content itself, font size, line spacing) commit on blur
so typing a number or a sentence doesn't fire a network call per keystroke.

### EDIT ribbon commands

`edit.addText`/`edit.addImage`/`edit.editText` (Phase 1 stubs) and the
`context.text.delete`/`context.image.delete` contextual commands flip to
`"available"`. `hooks/useContentEditorRunHandlers.ts` builds their real
`runHandlers`/`disabledReasons` maps — the same shape
`useOrganizeRunHandlers` established for ORGANIZE — merged into
`CommandRibbon`'s existing map alongside it. "Add Image" doesn't need a
separate ribbon-level file-picker trigger: arming placement mode is enough,
`ContentObjectLayer` itself opens the file chooser once the user draws the
placement box, keeping "where does this interaction live" consistent with
text/overlay-edit placement.

### `DevSelectionSimulator`

`"text"` and `"image"` removed from the simulated selection types (real
canvas selection exists now, via `ContentObjectLayer`) — the same removal
Phase 3 did for `"page"`. Only `"annotation"` remains simulated, pending
Phase 5.

### Real bugs found and fixed during this phase's own testing

All four found only by actually driving the feature in a real browser
against the live stack (typecheck/build caught none of them):

- **Wrong JSON level for `text_overlay_edit`'s `coverOriginal`/
  `coverColor`.** `lib/api.ts`'s `createOverlayTextEdit` posted them as
  sibling top-level fields; the backend (`DocumentContentController::
  validateObjectPayload`, `ContentObjectService::normalizeParams`) requires
  them nested inside `params`. Every real "Edit Text" placement would have
  `422`'d against the live backend — confirmed by reproducing the real
  request in a browser before the fix, and a real successful overlay-edit
  object after.
- **A mutation's own revision bump undid the selection it had just made.**
  `useContentObjects`'s effect resetting selection/refetching on a
  `useWorkingDocument.revision` change (intended for an ORGANIZE page
  operation invalidating the whole content-object chain) also fired on
  every content mutation's *own* revision bump — so `commitTextPlacement`'s
  `selectObject(result.objectId)` right after creating an object was
  immediately overwritten back to `"none"` on the next render. Fixed with a
  `selfCausedRevisionRef` flag set immediately before a self-triggered
  `applyOperationResult` call and consumed (skipping the reset) at the top
  of that effect.
- **`selectObject` derived an object's type from a not-yet-refetched
  array.** Looking up `objects.find(o => o.objectId === id)` right after
  create/duplicate raced the `refetch()` that would actually add it,
  silently falling through to `selection: "none"`. Fixed by letting
  `selectObject` take an optional explicit `knownType`, which every
  creator/duplicator now passes directly instead of relying on the lookup.
- **Clicking an existing object while armed to place a new one moved the
  existing object instead.** `ContentObjectLayer`'s per-object
  `startObjectDrag` didn't check `placementMode`, so drawing a new
  placement box over an existing object's bounds started a move/resize/
  rotate gesture on that object rather than the intended new-object
  placement. Fixed by ignoring object-level pointer handlers entirely
  while `placementMode` is set.

### Testing

No `chromium-cli` available in this sandbox (no network access to its
browser-download CDN either); driven instead via Playwright's Node API
pointed at the system's already-installed `google-chrome-stable`, against
the real live stack (`php artisan serve` + `php artisan queue:work` — the
latter's absence was itself briefly rediscovered as "why is this document
stuck in Processing forever" before being started — + `vite dev`). Verified
end-to-end, screenshot-confirmed at each step: creating a real text object,
a real inserted image, and a real overlay text-edit on the same page, each
producing the correct contextual ribbon group (`TEXT SELECTED` / `IMAGE
SELECTED`) and the correct Smart Inspector panel with real editable
controls (not the old dev-simulated `SelectionPanel` stub); and, critically,
that all three objects survived a real Save → full page reload → reopen
round trip, confirmed by re-viewing the reopened document's page 1 with all
three objects still present and correctly rendered — not just that the
`OperationResult` claimed success.

One incidental, non-blocking finding from this same testing session, left
as-is rather than fixed: a text/overlay-edit box drawn in a page's lower
portion can leave `TextComposerPopover`'s Confirm/Cancel row below the
visible scrollable viewport (the popover's `popoverBelow` placement logic
only accounts for room within the *page*, not the browser's actual
scrolled viewport), and reaching it by scrolling the main canvas also
shifts `view.currentPage` via the scroll-position `IntersectionObserver` —
cosmetic (the object still gets created at the correct position regardless)
but a genuine minor UX rough edge for a future polish pass. A defensive
`scrollIntoView` was added on the popover's mount, which helps but doesn't
fully solve the general case.

### What Phase 4 (frontend) does NOT include

Annotations (Phase 5) — `SelectionPanel`/`CONTEXTUAL_COMMANDS.annotation`
remain the Phase 1 stub. No backend changes. No fix for the popover
below-the-fold edge case beyond the mitigation noted above.
