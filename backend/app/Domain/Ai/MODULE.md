# Ai

**Responsibility:** AI-assisted document features (summarization, Q&A,
extraction, etc.) via one or more external AI providers (Anthropic,
OpenAI, Google, and others as they're added), never a local model.

> **Supersedes this module's original Phase 0 note** ("served
> exclusively by a local Ollama instance... never an external AI
> service"). That was Phase 0 speculation made before any real design
> work; the actual Phase 12 spec (2026-09-19, confirmed with the
> project owner) deliberately chose user-provided external-provider
> credentials instead, with matching safeguards designed in from the
> start rather than assumed away: AI is disabled by default
> (`config('ai.enabled')`), document content is never sent anywhere
> until a later phase explicitly builds consent/sensitive-content
> warnings (12.13) and prompt-injection defense (12.11), and no
> provider-specific code exists outside this module's own adapters.

**Owns:** No tables yet. Enable/disable, default provider, and
credentials will live in the existing (currently unused) `settings`
table — see the Settings module — once Phase 12.3 builds that surface;
this phase (12.2) added no schema.

**Exposes:** `Services\AiService` — the single call-through point every
future controller/job uses; nothing outside this module should
reference `Services\AiProviderRegistry`, `config('ai.providers')`, or
any `Contracts\AiProviderInterface` implementation directly.
`Exceptions\AiException` (in `app/Exceptions/`, alongside every other
domain's exception, per the project's existing convention) is the only
form a provider failure takes outside this module — see its own
docblock for why a raw provider error can never leak through it.

**Phase 12.1 status:** Architecture audit only (no code) — see
ARCHITECTURE.md's Phase 12.1 section for the full findings (no
existing server-side per-page text extraction, `pdftotext` already a
core dependency via Conversion, the unused `settings`/`audit_logs`
tables as ready-made homes for AI settings/audit logging).

**Phase 12.2 status:** The provider-independent abstraction is real:
`Contracts\AiProviderInterface`, its DTOs (`DTO/`), the error taxonomy
(`Enums\AiErrorCode`, `Enums\AiConnectionStatus`, `Exceptions\AiException`),
`Services\AiProviderRegistry`, and `Services\AiService`. `config/ai.php`
defaults `enabled` to `false` and `providers` to an empty map — **no
provider is implemented yet**, so there is nothing for
`AiProviderRegistry` to resolve in production; `AiService::provider()`
throws a normalized `AiException` immediately whenever AI is disabled
or a provider identifier isn't registered, which is what makes "the
app works with AI completely disabled" a real, tested property (see
`tests/Unit/Domain/Ai/AiServiceTest.php`) rather than just an absence
of UI. Anthropic (Phase 12.4) is the first real adapter to be added.
