<?php

namespace App\Domain\Ai\DTO;

/**
 * A generation request that additionally asks the provider for output
 * matching `schema` (a JSON-Schema-shaped array) — e.g. Phase 12.9's
 * name/date extraction. Not every provider supports this natively
 * (see AiProviderCapabilities::$supportsStructuredOutput); an adapter
 * without native support is expected to simulate it (schema-in-prompt
 * + parse) rather than claim the capability falsely.
 */
final readonly class AiStructuredRequest
{
    /**
     * @param  array<string, mixed>  $schema
     */
    public function __construct(
        public string $systemPrompt,
        public string $userPrompt,
        public array $schema,
        public ?int $maxTokens = null,
        public ?float $temperature = null,
    ) {}
}
