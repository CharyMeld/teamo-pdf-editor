<?php

namespace App\Domain\Ai\Services;

use App\Domain\Ai\Contracts\AiProviderInterface;
use App\Domain\Ai\DTO\AiConnectionResult;
use App\Domain\Ai\DTO\AiProviderConfig;
use App\Domain\Ai\DTO\AiResponse;
use App\Domain\Ai\DTO\AiStructuredRequest;
use App\Domain\Ai\DTO\AiTextRequest;
use App\Exceptions\AiException;

/**
 * The single call-through point the rest of TeamO uses to reach an AI
 * provider — see ARCHITECTURE.md's Phase 12.2 section for the full
 * AiService -> AiProviderInterface -> adapter shape. No controller,
 * job, or frontend code should ever reference a provider adapter class
 * or `config('ai.providers')` directly; everything goes through here.
 *
 * `isEnabled()`/`provider()` are what make "the application must work
 * with AI completely disabled" a real, enforced property: every other
 * method funnels through `provider()`, so a disabled or unconfigured
 * AI subsystem fails the same clear way (AiException::providerUnavailable())
 * no matter which method was called, rather than each call site having
 * to remember to check first.
 */
class AiService
{
    public function __construct(private readonly AiProviderRegistry $registry) {}

    public function isEnabled(): bool
    {
        return (bool) config('ai.enabled', false);
    }

    /** @return list<string> */
    public function availableProviderIdentifiers(): array
    {
        if (! $this->isEnabled()) {
            return [];
        }

        return $this->registry->identifiers();
    }

    /** @throws AiException */
    public function provider(string $identifier): AiProviderInterface
    {
        if (! $this->isEnabled()) {
            throw AiException::providerUnavailable('AI is disabled.');
        }

        return $this->registry->resolve($identifier);
    }

    public function testConnection(string $identifier, AiProviderConfig $config): AiConnectionResult
    {
        return $this->provider($identifier)->validateConnection($config);
    }

    /** @throws AiException */
    public function generateText(string $identifier, AiProviderConfig $config, AiTextRequest $request): AiResponse
    {
        return $this->provider($identifier)->generateText($config, $request);
    }

    /** @throws AiException */
    public function generateStructured(string $identifier, AiProviderConfig $config, AiStructuredRequest $request): AiResponse
    {
        return $this->provider($identifier)->generateStructured($config, $request);
    }
}
