<?php

namespace Tests\Support;

use App\Domain\Ai\Contracts\AiProviderInterface;
use App\Domain\Ai\DTO\AiConnectionResult;
use App\Domain\Ai\DTO\AiModelInfo;
use App\Domain\Ai\DTO\AiProviderCapabilities;
use App\Domain\Ai\DTO\AiProviderConfig;
use App\Domain\Ai\DTO\AiResponse;
use App\Domain\Ai\DTO\AiStructuredRequest;
use App\Domain\Ai\DTO\AiTextRequest;
use App\Domain\Ai\Enums\AiConnectionStatus;
use App\Exceptions\AiException;

/**
 * A test-only double for AiProviderInterface — proves AiService/
 * AiProviderRegistry correctly delegate and normalize errors, WITHOUT
 * being a real provider (never referenced by config/ai.php or any
 * production code path). Never register this outside tests/.
 */
class FakeAiProvider implements AiProviderInterface
{
    public static bool $shouldFailAuth = false;

    /** Set to a string containing a fake secret to prove AiException never leaks it (see AiServiceTest). */
    public static ?string $simulatedUpstreamErrorContainingSecret = null;

    public function identifier(): string
    {
        return 'fake';
    }

    public function displayName(): string
    {
        return 'Fake Provider (test only)';
    }

    public function capabilities(): AiProviderCapabilities
    {
        return new AiProviderCapabilities(
            supportsStructuredOutput: true,
            supportsStreaming: false,
            maxContextTokens: 100000,
        );
    }

    public function listModels(AiProviderConfig $config): array
    {
        return [new AiModelInfo(id: 'fake-model-1', label: 'Fake Model 1')];
    }

    public function validateConnection(AiProviderConfig $config): AiConnectionResult
    {
        if (self::$shouldFailAuth) {
            return new AiConnectionResult(AiConnectionStatus::AuthenticationFailed, 'Invalid API key.');
        }

        return new AiConnectionResult(AiConnectionStatus::Connected, 'Connected.', $this->listModels($config));
    }

    public function generateText(AiProviderConfig $config, AiTextRequest $request): AiResponse
    {
        if (self::$simulatedUpstreamErrorContainingSecret !== null) {
            // A real adapter must never pass a raw upstream error string
            // straight through — this simulates one that (incorrectly,
            // if forwarded raw) would contain a secret, then constructs
            // the exception with a pre-sanitized detail instead, exactly
            // as every real adapter must.
            throw AiException::authenticationFailed('The AI provider rejected the configured credentials.');
        }

        return new AiResponse(
            content: "Echo: {$request->userPrompt}",
            provider: $this->identifier(),
            model: $config->model ?? 'fake-model-1',
        );
    }

    public function generateStructured(AiProviderConfig $config, AiStructuredRequest $request): AiResponse
    {
        return new AiResponse(
            content: json_encode(['echo' => $request->userPrompt]),
            provider: $this->identifier(),
            model: $config->model ?? 'fake-model-1',
        );
    }
}
