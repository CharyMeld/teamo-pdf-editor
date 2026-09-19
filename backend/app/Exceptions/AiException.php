<?php

namespace App\Exceptions;

use App\Domain\Ai\Enums\AiErrorCode;

/**
 * Every failure an AI provider adapter or AiService can raise — the
 * ONLY way a provider-specific error is allowed to surface, per the
 * spec's "do not expose provider-specific errors directly to users."
 *
 * Deliberately structured so a raw credential can never end up in
 * `getMessage()`: every factory takes a pre-written, already-safe
 * `$detail` string built by the caller (which is responsible for never
 * interpolating `AiProviderConfig::$apiKey` or any provider response
 * body verbatim into it) rather than accepting a provider's raw
 * exception/response and formatting it here. There is deliberately no
 * generic `AiException::fromProvider(Throwable $e)` constructor for
 * exactly this reason — that shape invites forwarding an unsanitized
 * message.
 */
class AiException extends DomainException
{
    // Named `errorCode`, not `code` — PHP's built-in `Exception` already
    // declares a non-readonly `$code` property, and redeclaring it as
    // `readonly` here is a fatal error ("Cannot redeclare non-readonly
    // property Exception::$code as readonly"), caught by actually
    // running the test suite rather than assumed safe.
    private function __construct(
        public readonly AiErrorCode $errorCode,
        string $message,
        private readonly int $status,
    ) {
        parent::__construct($message);
    }

    public function statusCode(): int
    {
        return $this->status;
    }

    public function context(): array
    {
        return ['ai_error_code' => $this->errorCode->value];
    }

    public static function authenticationFailed(string $detail = 'The AI provider rejected the configured credentials.'): self
    {
        return new self(AiErrorCode::AuthenticationFailed, $detail, 502);
    }

    public static function rateLimited(string $detail = 'The AI provider is rate-limiting requests. Try again shortly.'): self
    {
        return new self(AiErrorCode::RateLimited, $detail, 429);
    }

    public static function timeout(string $detail = 'The AI provider did not respond in time.'): self
    {
        return new self(AiErrorCode::Timeout, $detail, 504);
    }

    public static function providerUnavailable(string $detail = 'The AI provider is not available.'): self
    {
        return new self(AiErrorCode::ProviderUnavailable, $detail, 503);
    }

    public static function invalidRequest(string $detail = 'The AI request was invalid.'): self
    {
        return new self(AiErrorCode::InvalidRequest, $detail, 422);
    }

    public static function modelUnavailable(string $detail = 'The requested AI model is not available.'): self
    {
        return new self(AiErrorCode::ModelUnavailable, $detail, 422);
    }

    public static function contextLimitExceeded(string $detail = 'The request exceeds the AI provider\'s context limit.'): self
    {
        return new self(AiErrorCode::ContextLimitExceeded, $detail, 422);
    }

    public static function malformedProviderResponse(string $detail = 'The AI provider returned an unexpected response.'): self
    {
        return new self(AiErrorCode::MalformedProviderResponse, $detail, 502);
    }

    public static function unknownProviderError(string $detail = 'The AI provider returned an unknown error.'): self
    {
        return new self(AiErrorCode::UnknownProviderError, $detail, 502);
    }
}
