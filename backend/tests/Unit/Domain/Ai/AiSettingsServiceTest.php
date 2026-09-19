<?php

namespace Tests\Unit\Domain\Ai;

use App\Domain\Ai\Services\AiSettingsService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

/**
 * This project has no separate test database (see phpunit.xml) — every
 * test that touches a real table uses DatabaseTransactions so nothing
 * is left behind in the shared dev MySQL database.
 */
class AiSettingsServiceTest extends TestCase
{
    use DatabaseTransactions;

    public function test_ai_enabled_falls_back_to_config_when_no_row_exists(): void
    {
        config(['ai.enabled' => true]);
        $service = app(AiSettingsService::class);

        $this->assertTrue($service->isAiEnabled());

        config(['ai.enabled' => false]);
        $this->assertFalse($service->isAiEnabled());
    }

    public function test_ai_enabled_round_trips_through_the_settings_table(): void
    {
        config(['ai.enabled' => false]);
        $service = app(AiSettingsService::class);

        $service->setAiEnabled(true);
        $this->assertTrue($service->isAiEnabled());

        $service->setAiEnabled(false);
        $this->assertFalse($service->isAiEnabled());
    }

    public function test_external_processing_defaults_false_and_round_trips(): void
    {
        $service = app(AiSettingsService::class);

        $this->assertFalse($service->isExternalProcessingEnabled());

        $service->setExternalProcessingEnabled(true);
        $this->assertTrue($service->isExternalProcessingEnabled());
    }

    public function test_default_provider_defaults_null_and_round_trips(): void
    {
        $service = app(AiSettingsService::class);

        $this->assertNull($service->defaultProvider());

        $service->setDefaultProvider('anthropic');
        $this->assertSame('anthropic', $service->defaultProvider());

        $service->setDefaultProvider(null);
        $this->assertNull($service->defaultProvider());
    }
}
