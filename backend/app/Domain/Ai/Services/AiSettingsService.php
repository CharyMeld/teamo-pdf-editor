<?php

namespace App\Domain\Ai\Services;

use App\Models\Setting;

/**
 * The first real usage of the `settings` table (schema existed since
 * Phase 0, unused until now — see ARCHITECTURE.md's Phase 12.1 audit).
 * Wraps three scalar AI toggles as individual `settings` rows rather
 * than one JSON blob, so each is independently queryable/auditable.
 *
 * `isAiEnabled()` falls back to `config('ai.enabled')` when no row
 * exists yet — this is what keeps Phase 12.2's `AiServiceTest` (which
 * sets `config(['ai.enabled' => ...])` directly and never touches the
 * `settings` table) passing unmodified: the env-level default still
 * applies until an operator actually visits the settings UI.
 */
class AiSettingsService
{
    private const KEY_ENABLED = 'ai.enabled';

    private const KEY_EXTERNAL_PROCESSING = 'ai.external_processing_enabled';

    private const KEY_DEFAULT_PROVIDER = 'ai.default_provider';

    public function isAiEnabled(): bool
    {
        $value = $this->get(self::KEY_ENABLED);

        return $value !== null ? (bool) $value : (bool) config('ai.enabled', false);
    }

    public function setAiEnabled(bool $enabled): void
    {
        $this->put(self::KEY_ENABLED, $enabled);
    }

    public function isExternalProcessingEnabled(): bool
    {
        return (bool) ($this->get(self::KEY_EXTERNAL_PROCESSING) ?? false);
    }

    public function setExternalProcessingEnabled(bool $enabled): void
    {
        $this->put(self::KEY_EXTERNAL_PROCESSING, $enabled);
    }

    public function defaultProvider(): ?string
    {
        $value = $this->get(self::KEY_DEFAULT_PROVIDER);

        return is_string($value) && $value !== '' ? $value : null;
    }

    public function setDefaultProvider(?string $provider): void
    {
        $this->put(self::KEY_DEFAULT_PROVIDER, $provider);
    }

    private function get(string $key): mixed
    {
        return Setting::where('key', $key)->value('value');
    }

    /**
     * `settings.value` is a NOT NULL JSON column (Phase 0's original
     * schema) — storing a real SQL NULL to represent "unset" fails at
     * the DB level (a real error, caught by actually running the
     * tests, not assumed). Deleting the row instead is both a valid
     * fix and the more correct representation anyway: "no row" already
     * means "unset" everywhere else this class reads from (`get()`
     * returning null falls through to a default), so a null write is
     * just the delete case of the same convention.
     */
    private function put(string $key, mixed $value): void
    {
        if ($value === null) {
            Setting::where('key', $key)->delete();

            return;
        }

        Setting::updateOrCreate(['key' => $key], ['value' => $value]);
    }
}
