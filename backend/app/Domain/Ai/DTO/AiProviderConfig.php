<?php

namespace App\Domain\Ai\DTO;

/**
 * Everything a provider adapter needs to make one request: which
 * credential/model to use, and any provider-specific options. Built
 * fresh per request from whatever Phase 12.3's credential storage
 * decrypts — this class itself never persists anything and is never
 * logged (see AiException's docblock for why messages never
 * interpolate `$apiKey`).
 */
final readonly class AiProviderConfig
{
    /**
     * @param  array<string, mixed>  $options  Provider-specific extras (e.g. a base URL override) — deliberately untyped since each adapter defines its own accepted keys.
     */
    public function __construct(
        public string $identifier,
        public ?string $apiKey = null,
        public ?string $model = null,
        public array $options = [],
    ) {}
}
