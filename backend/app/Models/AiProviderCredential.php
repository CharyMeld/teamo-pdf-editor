<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A stored, per-provider API credential — see
 * app/Domain/Ai/Services/AiCredentialService.php for the only code
 * allowed to read/write these. `api_key` is encrypted at rest via the
 * `encrypted` cast below (Laravel's built-in `Crypt` facade under the
 * hood, keyed by APP_KEY); `$hidden` is defense-in-depth in case any
 * future code accidentally serializes this model directly — the
 * controller never does, building its response arrays by hand instead.
 */
class AiProviderCredential extends Model
{
    protected $fillable = [
        'user_id',
        'provider',
        'api_key',
        'model',
        'enabled',
        'last_tested_at',
        'last_test_status',
        'last_test_message',
    ];

    protected $hidden = ['api_key'];

    protected function casts(): array
    {
        return [
            'api_key' => 'encrypted',
            'enabled' => 'boolean',
            'last_tested_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
