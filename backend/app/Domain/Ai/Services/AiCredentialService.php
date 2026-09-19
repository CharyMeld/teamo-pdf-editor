<?php

namespace App\Domain\Ai\Services;

use App\Domain\Ai\DTO\AiConnectionResult;
use App\Domain\Ai\DTO\AiProviderConfig;
use App\Exceptions\AiException;
use App\Models\AiProviderCredential;
use App\Models\User;

/**
 * The only code allowed to read/write `ai_provider_credentials` — see
 * that model's docblock for the encryption-at-rest detail. Validates
 * every provider identifier against `config('ai.known_providers')`
 * (a display/validation catalog, distinct from `config('ai.providers')`'s
 * adapter map — see config/ai.php's own comment), so a credential can
 * be stored for a provider before its adapter ships without ever
 * pretending an unimplemented provider is real.
 */
class AiCredentialService
{
    /**
     * @return list<array{identifier: string, displayName: string, configured: bool, enabled: bool, model: ?string, lastTestedAt: ?string, lastTestStatus: ?string, lastTestMessage: ?string}>
     */
    public function listForCatalog(User $user): array
    {
        $known = config('ai.known_providers', []);
        $stored = AiProviderCredential::where('user_id', $user->id)
            ->whereIn('provider', array_keys($known))
            ->get()
            ->keyBy('provider');

        return collect($known)
            ->map(function (string $displayName, string $identifier) use ($stored) {
                /** @var AiProviderCredential|null $credential */
                $credential = $stored->get($identifier);

                return [
                    'identifier' => $identifier,
                    'displayName' => $displayName,
                    'configured' => $credential !== null,
                    'enabled' => $credential?->enabled ?? false,
                    'model' => $credential?->model,
                    'lastTestedAt' => $credential?->last_tested_at?->toIso8601String(),
                    'lastTestStatus' => $credential?->last_test_status,
                    'lastTestMessage' => $credential?->last_test_message,
                ];
            })
            ->values()
            ->all();
    }

    public function store(User $user, string $provider, string $apiKey, ?string $model): AiProviderCredential
    {
        $this->assertKnownProvider($provider);

        if (trim($apiKey) === '') {
            throw AiException::invalidRequest('An API key is required.');
        }

        return AiProviderCredential::updateOrCreate(
            ['user_id' => $user->id, 'provider' => $provider],
            ['api_key' => $apiKey, 'model' => $model, 'enabled' => true],
        );
    }

    public function remove(User $user, string $provider): void
    {
        $this->assertKnownProvider($provider);

        AiProviderCredential::where('user_id', $user->id)->where('provider', $provider)->delete();
    }

    /** @throws AiException */
    public function configFor(User $user, string $provider): AiProviderConfig
    {
        $this->assertKnownProvider($provider);

        $credential = AiProviderCredential::where('user_id', $user->id)
            ->where('provider', $provider)
            ->where('enabled', true)
            ->first();

        if (! $credential) {
            throw AiException::providerUnavailable("No credentials are configured for \"{$provider}\".");
        }

        return new AiProviderConfig(
            identifier: $provider,
            apiKey: $credential->api_key,
            model: $credential->model,
        );
    }

    public function recordTestResult(User $user, string $provider, AiConnectionResult $result): void
    {
        AiProviderCredential::where('user_id', $user->id)
            ->where('provider', $provider)
            ->update([
                'last_tested_at' => now(),
                'last_test_status' => $result->status->value,
                'last_test_message' => $result->message,
            ]);
    }

    private function assertKnownProvider(string $provider): void
    {
        if (! array_key_exists($provider, config('ai.known_providers', []))) {
            throw AiException::invalidRequest("\"{$provider}\" is not a known AI provider.");
        }
    }
}
