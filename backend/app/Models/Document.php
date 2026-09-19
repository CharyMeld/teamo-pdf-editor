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

    /**
     * A computed, purely presentational lifecycle label (Phase 13) —
     * deliberately separate from the real `status` column, which keeps
     * governing ingest/processing exactly as every prior phase built
     * it. `status` answers "can this document be worked on right now;
     * `lifecycleState` answers "where is this document in its own
     * edit/save history," for the document-management UI's benefit
     * only — nothing else should key behavior off this value.
     */
    public function lifecycleState(): string
    {
        // `versions_count` is used when eager-loaded via
        // `->withCount('versions')` (see DocumentController::index(),
        // Phase 14 hardening — avoids an N+1 COUNT query per document
        // in a list response); falls back to a real query for
        // single-document contexts (show/duplicate) where it isn't.
        return match ($this->status) {
            'uploading', 'validating', 'processing' => 'processing',
            'failed' => 'failed',
            'archived' => 'archived',
            'password_protected' => 'password_protected',
            default => $this->hasPendingEdits()
                ? 'working'
                : (($this->versions_count ?? $this->versions()->count()) > 1 ? 'saved' : 'original'),
        };
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
            'updatedAt' => $this->updated_at?->toIso8601String(),
            'lifecycleState' => $this->lifecycleState(),
        ];
    }
}
