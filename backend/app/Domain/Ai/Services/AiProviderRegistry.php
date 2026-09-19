<?php

namespace App\Domain\Ai\Services;

use App\Domain\Ai\Contracts\AiProviderInterface;
use App\Exceptions\AiException;

/**
 * Resolves a provider identifier (e.g. "anthropic") to a real adapter
 * instance, via `config('ai.providers')` — an identifier-to-FQCN map
 * that starts empty and gains one entry per provider phase (12.4+).
 * This is what lets "the architecture must allow Anthropic/OpenAI/
 * Google/other providers without rewriting the AI workspace" hold:
 * adding a provider is a new adapter class plus one config line, never
 * a change here or in AiService.
 */
class AiProviderRegistry
{
    /** @return list<string> */
    public function identifiers(): array
    {
        return array_keys(config('ai.providers', []));
    }

    public function resolve(string $identifier): AiProviderInterface
    {
        $class = config("ai.providers.{$identifier}");

        if (! $class || ! class_exists($class)) {
            throw AiException::providerUnavailable("Unknown AI provider \"{$identifier}\".");
        }

        $instance = app($class);

        if (! $instance instanceof AiProviderInterface) {
            throw AiException::providerUnavailable("\"{$identifier}\" is not a valid AI provider.");
        }

        return $instance;
    }
}
