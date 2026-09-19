<?php

namespace Tests\Feature\Ai;

use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

class AiSettingsControllerTest extends TestCase
{
    use DatabaseTransactions;

    public function test_get_settings_returns_defaults_with_no_configuration(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->getJson('/api/ai/settings');

        $response->assertOk();
        $response->assertJsonPath('enabled', false);
        $response->assertJsonPath('externalProcessingEnabled', false);
        $response->assertJsonPath('defaultProvider', null);
        $response->assertJsonCount(3, 'providers');
        $response->assertJsonPath('providers.0.configured', false);
    }

    public function test_patch_settings_updates_the_toggles(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->patchJson('/api/ai/settings', [
            'enabled' => true,
            'externalProcessingEnabled' => true,
            'defaultProvider' => 'anthropic',
        ]);

        $response->assertOk();
        $response->assertJsonPath('enabled', true);
        $response->assertJsonPath('externalProcessingEnabled', true);
        $response->assertJsonPath('defaultProvider', 'anthropic');
    }

    public function test_patch_settings_rejects_an_unknown_default_provider(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->patchJson('/api/ai/settings', [
            'defaultProvider' => 'not-a-real-provider',
        ]);

        $response->assertStatus(422);
    }

    public function test_storing_a_credential_never_echoes_the_api_key_back(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->putJson('/api/ai/settings/providers/anthropic/credentials', [
            'apiKey' => 'sk-super-secret',
            'model' => 'claude-x',
        ]);

        $response->assertOk();
        $response->assertJsonPath('providers.0.configured', true);
        $response->assertJsonPath('providers.0.model', 'claude-x');
        $this->assertStringNotContainsString('sk-super-secret', $response->getContent());
    }

    public function test_deleting_a_credential_removes_it(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user)->putJson('/api/ai/settings/providers/anthropic/credentials', ['apiKey' => 'sk-key']);

        $response = $this->actingAs($user)->deleteJson('/api/ai/settings/providers/anthropic/credentials');

        $response->assertOk();
        $response->assertJsonPath('providers.0.configured', false);
    }

    public function test_testing_a_stored_but_unregistered_provider_reports_provider_unavailable(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user)->putJson('/api/ai/settings/providers/anthropic/credentials', ['apiKey' => 'sk-key']);

        $response = $this->actingAs($user)->postJson('/api/ai/settings/providers/anthropic/test');

        $response->assertOk();
        $response->assertJsonPath('status', 'PROVIDER_UNAVAILABLE');
        $this->assertStringNotContainsString('sk-key', $response->getContent());
    }

    public function test_testing_a_draft_key_with_no_stored_credential_also_reports_provider_unavailable(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/ai/settings/providers/anthropic/test', [
            'apiKey' => 'sk-draft-key',
        ]);

        $response->assertOk();
        $response->assertJsonPath('status', 'PROVIDER_UNAVAILABLE');
    }
}
