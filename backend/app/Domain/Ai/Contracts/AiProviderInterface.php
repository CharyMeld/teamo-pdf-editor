<?php

namespace App\Domain\Ai\Contracts;

use App\Domain\Ai\DTO\AiConnectionResult;
use App\Domain\Ai\DTO\AiModelInfo;
use App\Domain\Ai\DTO\AiProviderCapabilities;
use App\Domain\Ai\DTO\AiProviderConfig;
use App\Domain\Ai\DTO\AiResponse;
use App\Domain\Ai\DTO\AiStructuredRequest;
use App\Domain\Ai\DTO\AiTextRequest;
use App\Exceptions\AiException;

/**
 * The contract every AI provider adapter implements — the only thing
 * AiService/AiProviderRegistry depend on, so adding a provider (Phase
 * 12.4's Anthropic, and later OpenAI/Google/etc.) never requires
 * changing AiService or anything above it.
 *
 * Error normalization is deliberately NOT a method here: it's a
 * responsibility every implementation carries out internally by
 * catching its own SDK/HTTP-level errors and throwing AiException with
 * the matching AiErrorCode, rather than returning a raw provider error
 * for the caller to interpret. A separate `normalizeError()` method
 * would just move that same logic one call frame away for no benefit.
 */
interface AiProviderInterface
{
    /** A short, stable, lowercase identifier (e.g. "anthropic") — the key used in config('ai.providers') and everywhere a provider is referenced by name. */
    public function identifier(): string;

    /** A human-readable name for display in settings/workspace UI (e.g. "Anthropic Claude"). */
    public function displayName(): string;

    public function capabilities(): AiProviderCapabilities;

    /**
     * @return list<AiModelInfo>
     *
     * @throws AiException
     */
    public function listModels(AiProviderConfig $config): array;

    /** Never throws — a failed connection attempt is a normal, displayable AiConnectionResult, not an exception. */
    public function validateConnection(AiProviderConfig $config): AiConnectionResult;

    /** @throws AiException */
    public function generateText(AiProviderConfig $config, AiTextRequest $request): AiResponse;

    /** @throws AiException */
    public function generateStructured(AiProviderConfig $config, AiStructuredRequest $request): AiResponse;
}
