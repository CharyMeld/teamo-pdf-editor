<?php

namespace App\Domain\Ai\DTO;

/**
 * What a provider adapter genuinely supports — read by the future AI
 * workspace (Phase 12.6+) to decide what to offer (e.g. hide a
 * "structured extraction" quick action for a provider that can't do
 * it), never to paper over a real capability gap.
 */
final readonly class AiProviderCapabilities
{
    public function __construct(
        public bool $supportsStructuredOutput,
        public bool $supportsStreaming,
        public ?int $maxContextTokens = null,
    ) {}
}
