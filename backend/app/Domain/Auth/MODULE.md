# Auth

**Responsibility:** User authentication (login/logout, token issuance) and CSRF/session
protection for the SPA.

**Owns:** No dedicated tables — uses Laravel's default `users` table plus Sanctum's
`personal_access_tokens` table.

**Exposes:** `auth:sanctum` middleware guard for protecting API routes.

**Phase 0 status:** Handled entirely by Laravel + Sanctum defaults (SPA cookie auth via
`EnsureFrontendRequestsAreStateful`, registered in `bootstrap/app.php`). No custom code
in this module yet. Login/register endpoints ship in Phase 1.
