<?php

namespace App\Domain\Ai\Enums;

/**
 * The normalized set of failure categories any AI provider adapter's
 * request (generateText/generateStructured) can fail with — see
 * AiException, which is the only thing allowed to construct one of
 * these from a real, provider-specific error. Nothing outside the
 * Ai domain should ever see a raw provider SDK/HTTP exception.
 */
enum AiErrorCode: string
{
    case AuthenticationFailed = 'AUTHENTICATION_FAILED';
    case RateLimited = 'RATE_LIMITED';
    case Timeout = 'TIMEOUT';
    case ProviderUnavailable = 'PROVIDER_UNAVAILABLE';
    case InvalidRequest = 'INVALID_REQUEST';
    case ModelUnavailable = 'MODEL_UNAVAILABLE';
    case ContextLimitExceeded = 'CONTEXT_LIMIT_EXCEEDED';
    case MalformedProviderResponse = 'MALFORMED_PROVIDER_RESPONSE';
    case UnknownProviderError = 'UNKNOWN_PROVIDER_ERROR';
}
