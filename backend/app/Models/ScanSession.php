<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ScanSession extends Model
{
    protected $fillable = [
        'uuid',
        'user_id',
        'status',
        'created_document_id',
    ];

    /** Addressed publicly by UUID, never the internal id — same convention as Document. */
    public function getRouteKeyName(): string
    {
        return 'uuid';
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function createdDocument(): BelongsTo
    {
        return $this->belongsTo(Document::class, 'created_document_id');
    }

    /** Ordered by `position` — the real page order, not insertion order. */
    public function images(): HasMany
    {
        return $this->hasMany(ScanSessionImage::class)->orderBy('position');
    }
}
