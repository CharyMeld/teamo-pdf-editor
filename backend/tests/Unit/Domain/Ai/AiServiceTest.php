<?php

namespace Tests\Unit\Domain\Ai;

use App\Domain\Ai\DTO\AiProviderConfig;
use App\Domain\Ai\DTO\AiTextRequest;
use App\Domain\Ai\Enums\AiConnectionStatus;
use App\Domain\Ai\Enums\AiErrorCode;
use App\Domain\Ai\Services\AiService;
use App\Exceptions\AiException;
use Tests\Support\FakeAiProvider;
use Tests\TestCase;

/**
 * Exercises the provider-independent abstraction built in Phase 12.2
 * against a test-only FakeAiProvider — no real provider exists yet
 * (Phase 12.4+), and no document content or network call is involved.
 * Proves the two properties the spec explicitly requires: the app
 * works with AI completely disabled, and provider errors never leak a
 * raw credential.
 */
class AiServiceTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        FakeAiProvider::$shouldFailAuth = false;
        FakeAiProvider::$simulatedUpstreamErrorContainingSecret = null;
    }

    public function test_provider_throws_when_ai_disabled(): void
    {
        config(['ai.enabled' => false, 'ai.providers.fake' => FakeAiProvider::class]);

        $service = app(AiService::class);

        $this->expectException(AiException::class);
        $service->provider('fake');
    }

    public function test_disabled_ai_reports_no_available_providers(): void
    {
        config(['ai.enabled' => false, 'ai.providers.fake' => FakeAiProvider::class]);

        $service = app(AiService::class);

        $this->assertSame([], $service->availableProviderIdentifiers());
    }

    public function test_provider_throws_for_unregistered_identifier(): void
    {
        config(['ai.enabled' => true, 'ai.providers' => []]);

        $service = app(AiService::class);

        try {
            $service->provider('does-not-exist');
            $this->fail('Expected an AiException.');
        } catch (AiException $e) {
            $this->assertSame(AiErrorCode::ProviderUnavailable, $e->errorCode);
        }
    }

    public function test_generate_text_delegates_to_the_resolved_provider(): void
    {
        config(['ai.enabled' => true, 'ai.providers.fake' => FakeAiProvider::class]);

        $service = app(AiService::class);
        $response = $service->generateText(
            'fake',
            new AiProviderConfig(identifier: 'fake', apiKey: 'not-a-real-key'),
            new AiTextRequest(systemPrompt: 'You are a test.', userPrompt: 'ping'),
        );

        $this->assertSame('Echo: ping', $response->content);
        $this->assertSame('fake', $response->provider);
    }

    public function test_test_connection_reports_connected(): void
    {
        config(['ai.enabled' => true, 'ai.providers.fake' => FakeAiProvider::class]);

        $service = app(AiService::class);
        $result = $service->testConnection('fake', new AiProviderConfig(identifier: 'fake', apiKey: 'not-a-real-key'));

        $this->assertSame(AiConnectionStatus::Connected, $result->status);
        $this->assertNotEmpty($result->availableModels);
    }

    public function test_test_connection_reports_authentication_failed(): void
    {
        config(['ai.enabled' => true, 'ai.providers.fake' => FakeAiProvider::class]);
        FakeAiProvider::$shouldFailAuth = true;

        $service = app(AiService::class);
        $result = $service->testConnection('fake', new AiProviderConfig(identifier: 'fake', apiKey: 'wrong'));

        $this->assertSame(AiConnectionStatus::AuthenticationFailed, $result->status);
    }

    public function test_ai_exception_never_leaks_a_raw_secret(): void
    {
        config(['ai.enabled' => true, 'ai.providers.fake' => FakeAiProvider::class]);
        $secret = 'sk-super-secret-test-key-123';
        FakeAiProvider::$simulatedUpstreamErrorContainingSecret = "upstream said: invalid key {$secret}";

        $service = app(AiService::class);

        try {
            $service->generateText(
                'fake',
                new AiProviderConfig(identifier: 'fake', apiKey: $secret),
                new AiTextRequest(systemPrompt: 'sys', userPrompt: 'ping'),
            );
            $this->fail('Expected an AiException.');
        } catch (AiException $e) {
            $this->assertSame(AiErrorCode::AuthenticationFailed, $e->errorCode);
            $this->assertStringNotContainsString($secret, $e->getMessage());
        }
    }

    public function test_ai_exception_status_codes_match_the_spec_taxonomy(): void
    {
        $this->assertSame(502, AiException::authenticationFailed()->statusCode());
        $this->assertSame(429, AiException::rateLimited()->statusCode());
        $this->assertSame(504, AiException::timeout()->statusCode());
        $this->assertSame(503, AiException::providerUnavailable()->statusCode());
        $this->assertSame(422, AiException::invalidRequest()->statusCode());
        $this->assertSame(422, AiException::modelUnavailable()->statusCode());
        $this->assertSame(422, AiException::contextLimitExceeded()->statusCode());
        $this->assertSame(502, AiException::malformedProviderResponse()->statusCode());
        $this->assertSame(502, AiException::unknownProviderError()->statusCode());
    }
}
