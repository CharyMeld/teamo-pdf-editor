<?php

namespace App\Domain\Ai\DTO;

/** One selectable model, as returned by AiProviderInterface::listModels(). */
final readonly class AiModelInfo
{
    public function __construct(
        public string $id,
        public string $label,
    ) {}
}
