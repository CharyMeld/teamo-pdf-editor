<?php

namespace App\Exceptions;

use Exception;

/**
 * Base class for exceptions raised by application modules (Documents,
 * Files, Ocr, Conversion, etc). Each module defines its own subclasses
 * as it gains real logic; this class only fixes the shared contract:
 * an HTTP status to render and a structured context array for the
 * "documents"/"jobs" log channels (never raw file paths or contents).
 */
abstract class DomainException extends Exception
{
    public function statusCode(): int
    {
        return 422;
    }

    public function context(): array
    {
        return [];
    }
}
