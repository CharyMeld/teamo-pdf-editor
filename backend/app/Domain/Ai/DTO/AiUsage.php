<?php

namespace App\Domain\Ai\DTO;

/** Token accounting for one request — all nullable since not every provider reports usage. */
final readonly class AiUsage
{
    public function __construct(
        public ?int $promptTokens = null,
        public ?int $completionTokens = null,
        public ?int $totalTokens = null,
    ) {}
}
