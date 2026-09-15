<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

class Document extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'uuid',
        'user_id',
        'title',
        'original_filename',
        'mime_type',
        'size_bytes',
        'status',
        'page_count',
        'current_step_id',
        'base_version_id',
    ];

    protected function casts(): array
    {
        return [
            'size_bytes' => 'integer',
            'page_count' => 'integer',
        ];
    }

    /** Documents are addressed publicly by UUID, never the internal id. */
    public function getRouteKeyName(): string
    {
        return 'uuid';
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function versions(): HasMany
    {
        return $this->hasMany(DocumentVersion::class);
    }

    public function currentVersion(): HasOne
    {
        return $this->hasOne(DocumentVersion::class)->where('is_current', true);
    }

    public function jobs(): HasMany
    {
        return $this->hasMany(DocumentJob::class);
    }

    public function editOperations(): HasMany
    {
        return $this->hasMany(DocumentEditOperation::class)->orderBy('sequence_number');
    }

    public function currentStep(): BelongsTo
    {
        return $this->belongsTo(DocumentEditOperation::class, 'current_step_id');
    }

    public function baseVersion(): BelongsTo
    {
        return $this->belongsTo(DocumentVersion::class, 'base_version_id');
    }

    /** True while the working copy has unsaved edits applied on top of its base version. */
    public function hasPendingEdits(): bool
    {
        return $this->current_step_id !== null;
    }

    public function auditLogs(): HasMany
    {
        return $this->hasMany(AuditLog::class);
    }
}
