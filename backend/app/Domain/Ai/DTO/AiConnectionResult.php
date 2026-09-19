<?php

namespace App\Domain\Ai\DTO;

use App\Domain\Ai\Enums\AiConnectionStatus;

/**
 * The result of AiProviderInterface::validateConnection() — always a
 * value, never an exception (a failed connection test is an expected,
 * displayable outcome for Phase 12.3's settings UI, not an error path).
 */
final readonly class AiConnectionResult
{
    /**
     * @param  list<AiModelInfo>  $availableModels
     */
    public function __construct(
        public AiConnectionStatus $status,
        public string $message,
        public array $availableModels = [],
    ) {}
}
