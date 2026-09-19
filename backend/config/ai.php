<?php

// AI module configuration — see ARCHITECTURE.md's Phase 12.2 section and
// app/Domain/Ai/MODULE.md. `enabled` defaults false so the application
// behaves identically to every prior phase until an operator explicitly
// opts in; AiService::provider() enforces this at the one call-through
// point every future AI feature uses, not just here.
return [
    'enabled' => (bool) env('AI_ENABLED', false),

    // Identifier => adapter FQCN. Empty until a provider ships (Phase
    // 12.4 adds Anthropic first); adding a provider later is exactly
    // one line here plus a new adapter class — nothing else changes.
    'providers' => [
        // 'anthropic' => \App\Domain\Ai\Providers\AnthropicProvider::class,
        // 'openai' => \App\Domain\Ai\Providers\OpenAiProvider::class,
        // 'google' => \App\Domain\Ai\Providers\GoogleProvider::class,
    ],
];
