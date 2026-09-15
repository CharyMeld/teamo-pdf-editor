# Users

**Responsibility:** User profile and account data.

**Owns:** `users` table (`App\Models\User`).

**Exposes:** `App\Models\User` and its relationships (`documents()`).

**Phase 0 status:** Handled by Laravel's default User model, extended with
`HasApiTokens` (Sanctum) and a `documents()` relation. No custom module code yet —
add here if user-facing profile/account logic grows beyond Laravel's defaults.
