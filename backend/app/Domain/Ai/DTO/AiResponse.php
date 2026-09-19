<?php

namespace App\Domain\Ai\DTO;

/**
 * A successful generation result — the ONLY thing an
 * AiProviderInterface::generateText()/generateStructured() call
 * returns; any failure is an AiException instead, never a value with
 * an embedded "ok: false" — see AiException's docblock for why that
 * split matters for "never expose provider-specific errors directly".
 */
final readonly class AiResponse
{
    public function __construct(
        public string $content,
        public string $provider,
        public string $model,
        public ?AiUsage $usage = null,
    ) {}
}
