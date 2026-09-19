<?php

namespace App\Domain\Ai\DTO;

/**
 * A plain text-generation request. `systemPrompt` and `userPrompt` are
 * kept as separate fields (not pre-concatenated) all the way down to
 * the adapter, so a future document-context/prompt-injection-defense
 * phase (12.5/12.11) has one obvious place to enforce the
 * SYSTEM/USER/DOCUMENT separation the spec requires — concatenating
 * early would make that separation unrecoverable by the time it
 * reaches a provider.
 */
final readonly class AiTextRequest
{
    public function __construct(
        public string $systemPrompt,
        public string $userPrompt,
        public ?int $maxTokens = null,
        public ?float $temperature = null,
    ) {}
}
