<?php

namespace App\Http\Controllers\Api;

use App\Domain\Ai\DTO\AiConnectionResult;
use App\Domain\Ai\DTO\AiProviderConfig;
use App\Domain\Ai\Enums\AiConnectionStatus;
use App\Domain\Ai\Services\AiCredentialService;
use App\Domain\Ai\Services\AiService;
use App\Domain\Ai\Services\AiSettingsService;
use App\Domain\Audit\Services\AuditLogger;
use App\Exceptions\AiException;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Phase 12.3 (AI provider settings): enable/disable AI, enable/disable
 * external processing, pick a default provider, and store/update/
 * remove/test per-provider credentials. Every response here is built
 * by hand, never a serialized model — `AiProviderCredential::api_key`
 * structurally cannot leak through this controller regardless of the
 * model's own `$hidden`. No provider adapter exists yet (Phase 12.4+),
 * so a connection test against any provider here honestly reports
 * PROVIDER_UNAVAILABLE rather than faking success.
 */
class AiSettingsController extends Controller
{
    public function __construct(
        private readonly AiSettingsService $settings,
        private readonly AiCredentialService $credentials,
        private readonly AiService $ai,
    ) {}

    public function show(Request $request): JsonResponse
    {
        return response()->json($this->buildSettingsPayload($request));
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'enabled' => ['sometimes', 'boolean'],
            'externalProcessingEnabled' => ['sometimes', 'boolean'],
            'defaultProvider' => ['sometimes', 'nullable', 'string', 'in:'.implode(',', array_keys(config('ai.known_providers', [])))],
        ]);

        if (array_key_exists('enabled', $data)) {
            $this->settings->setAiEnabled($data['enabled']);
        }
        if (array_key_exists('externalProcessingEnabled', $data)) {
            $this->settings->setExternalProcessingEnabled($data['externalProcessingEnabled']);
        }
        if (array_key_exists('defaultProvider', $data)) {
            $this->settings->setDefaultProvider($data['defaultProvider']);
        }

        AuditLogger::record('ai.settings.updated', context: $data, request: $request);

        return response()->json($this->buildSettingsPayload($request));
    }

    public function storeCredential(Request $request, string $provider): JsonResponse
    {
        $data = $request->validate([
            'apiKey' => ['required', 'string', 'min:1'],
            'model' => ['sometimes', 'nullable', 'string'],
        ]);

        try {
            $this->credentials->store($request->user(), $provider, $data['apiKey'], $data['model'] ?? null);
        } catch (AiException $e) {
            return response()->json(['error' => ['message' => $e->getMessage(), 'code' => $e->statusCode()]], $e->statusCode());
        }

        AuditLogger::record('ai.credentials.stored', context: ['provider' => $provider], request: $request);

        return response()->json($this->buildSettingsPayload($request));
    }

    public function destroyCredential(Request $request, string $provider): JsonResponse
    {
        $this->credentials->remove($request->user(), $provider);

        AuditLogger::record('ai.credentials.removed', context: ['provider' => $provider], request: $request);

        return response()->json($this->buildSettingsPayload($request));
    }

    public function testConnection(Request $request, string $provider): JsonResponse
    {
        $data = $request->validate([
            'apiKey' => ['sometimes', 'nullable', 'string'],
            'model' => ['sometimes', 'nullable', 'string'],
        ]);

        try {
            $config = ! empty($data['apiKey'])
                ? new AiProviderConfig(identifier: $provider, apiKey: $data['apiKey'], model: $data['model'] ?? null)
                : $this->credentials->configFor($request->user(), $provider);

            $result = $this->ai->testConnection($provider, $config);
        } catch (AiException $e) {
            $result = new AiConnectionResult(AiConnectionStatus::ProviderUnavailable, $e->getMessage());
        }

        $this->credentials->recordTestResult($request->user(), $provider, $result);

        AuditLogger::record('ai.connection.tested', context: ['provider' => $provider, 'status' => $result->status->value], request: $request);

        return response()->json([
            'status' => $result->status->value,
            'message' => $result->message,
            'availableModels' => array_map(fn ($m) => ['id' => $m->id, 'label' => $m->label], $result->availableModels),
        ]);
    }

    /** @return array{enabled: bool, externalProcessingEnabled: bool, defaultProvider: ?string, providers: array} */
    private function buildSettingsPayload(Request $request): array
    {
        return [
            'enabled' => $this->settings->isAiEnabled(),
            'externalProcessingEnabled' => $this->settings->isExternalProcessingEnabled(),
            'defaultProvider' => $this->settings->defaultProvider(),
            'providers' => $this->credentials->listForCatalog($request->user()),
        ];
    }
}
