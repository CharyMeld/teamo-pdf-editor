<?php

namespace App\Exceptions;

/**
 * Phase 10 (PDF forms): covers every real-world rejection the forms
 * endpoints can produce — mirrors `PageOperationException`'s shape for
 * Phase 4/5's content/annotation modules, kept as its own class since
 * forms is its own domain module.
 */
class FormException extends DomainException
{
    public static function unknownFieldType(string $type): self
    {
        return new self("Unknown form field type '{$type}'.");
    }

    public static function fieldNotFound(): self
    {
        return new self('That form field does not exist or belongs to a different document.');
    }

    public static function invalidFieldParams(string $detail): self
    {
        return new self("Invalid form field: {$detail}");
    }

    public static function notFillable(string $type): self
    {
        return new self("A '{$type}' field cannot be filled yet — full signing support arrives in a later phase.");
    }

    public static function processingFailed(string $detail): self
    {
        return new self("The form operation could not be completed: {$detail}");
    }
}
