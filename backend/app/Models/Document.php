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

    /**
     * The one real serialization shape every endpoint that hands a
     * document summary to the frontend uses — extracted from
     * `DocumentController::serializeDocument()` once Phase 6's
     * `ScanSessionController` needed the identical shape for a
     * freshly-created "combined from images" document, rather than a
     * second, divergent copy.
     */
    public function toSummaryArray(): array
    {
        return [
            'id' => $this->uuid,
            'title' => $this->title,
            'filename' => $this->original_filename,
            'mimeType' => $this->mime_type,
            'sizeBytes' => $this->size_bytes,
            'status' => $this->status,
            'pageCount' => $this->page_count,
            'createdAt' => $this->created_at?->toIso8601String(),
        ];
    }
}
