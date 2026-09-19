<?php

namespace Tests\Unit\Domain\Ai;

use App\Domain\Ai\DTO\AiConnectionResult;
use App\Domain\Ai\Enums\AiConnectionStatus;
use App\Domain\Ai\Services\AiCredentialService;
use App\Exceptions\AiException;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class AiCredentialServiceTest extends TestCase
{
    use DatabaseTransactions;

    private function service(): AiCredentialService
    {
        return app(AiCredentialService::class);
    }

    public function test_store_actually_encrypts_the_api_key_at_rest(): void
    {
        $user = User::factory()->create();
        $plaintext = 'sk-plaintext-test-key-abc123';

        $credential = $this->service()->store($user, 'anthropic', $plaintext, 'claude-x');

        $rawColumn = DB::table('ai_provider_credentials')->where('id', $credential->id)->value('api_key');
        $this->assertNotSame($plaintext, $rawColumn);
        $this->assertStringNotContainsString($plaintext, $rawColumn);

        // But the model itself decrypts transparently for real use.
        $this->assertSame($plaintext, $credential->fresh()->api_key);
    }

    public function test_store_rejects_an_unknown_provider(): void
    {
        $user = User::factory()->create();

        $this->expectException(AiException::class);
        $this->service()->store($user, 'not-a-real-provider', 'key', null);
    }

    public function test_config_for_hydrates_from_a_stored_credential(): void
    {
        $user = User::factory()->create();
        $this->service()->store($user, 'anthropic', 'sk-real-key', 'claude-x');

        $config = $this->service()->configFor($user, 'anthropic');

        $this->assertSame('anthropic', $config->identifier);
        $this->assertSame('sk-real-key', $config->apiKey);
        $this->assertSame('claude-x', $config->model);
    }

    public function test_config_for_throws_when_nothing_is_stored(): void
    {
        $user = User::factory()->create();

        $this->expectException(AiException::class);
        $this->service()->configFor($user, 'anthropic');
    }

    public function test_remove_deletes_the_credential(): void
    {
        $user = User::factory()->create();
        $this->service()->store($user, 'anthropic', 'sk-real-key', null);

        $this->service()->remove($user, 'anthropic');

        $this->assertDatabaseCount('ai_provider_credentials', 0);
    }

    public function test_list_for_catalog_reflects_configured_state_without_the_key(): void
    {
        $user = User::factory()->create();
        $this->service()->store($user, 'anthropic', 'sk-real-key', 'claude-x');

        $catalog = $this->service()->listForCatalog($user);
        $anthropic = collect($catalog)->firstWhere('identifier', 'anthropic');
        $openai = collect($catalog)->firstWhere('identifier', 'openai');

        $this->assertTrue($anthropic['configured']);
        $this->assertSame('claude-x', $anthropic['model']);
        $this->assertArrayNotHasKey('apiKey', $anthropic);
        $this->assertFalse($openai['configured']);
    }

    public function test_record_test_result_persists_status_and_message(): void
    {
        $user = User::factory()->create();
        $credential = $this->service()->store($user, 'anthropic', 'sk-real-key', null);

        $this->service()->recordTestResult(
            $user,
            'anthropic',
            new AiConnectionResult(AiConnectionStatus::ProviderUnavailable, 'not available yet'),
        );

        $credential->refresh();
        $this->assertSame('PROVIDER_UNAVAILABLE', $credential->last_test_status);
        $this->assertSame('not available yet', $credential->last_test_message);
        $this->assertNotNull($credential->last_tested_at);
    }
}
