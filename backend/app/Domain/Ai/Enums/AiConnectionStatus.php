<?php

namespace App\Domain\Ai\Enums;

/**
 * The normalized result of AiProviderInterface::validateConnection() —
 * a deliberately smaller set than AiErrorCode, since a connection test
 * only ever needs to answer "can this configuration reach the
 * provider," not the full request-time failure taxonomy (rate limits,
 * context limits, etc. don't apply to a bare connectivity check).
 */
enum AiConnectionStatus: string
{
    case Connected = 'CONNECTED';
    case AuthenticationFailed = 'AUTHENTICATION_FAILED';
    case ProviderUnavailable = 'PROVIDER_UNAVAILABLE';
    case InvalidConfiguration = 'INVALID_CONFIGURATION';
    case ModelUnavailable = 'MODEL_UNAVAILABLE';
    case UnknownError = 'UNKNOWN_ERROR';
}
