<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DocumentEditOperation extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'document_id',
        'sequence_number',
        'operation_type',
        'payload',
        'resulting_storage_path',
        'page_count_after',
        'pages_snapshot',
        'created_by',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'sequence_number' => 'integer',
            'payload' => 'array',
            'page_count_after' => 'integer',
            'pages_snapshot' => 'array',
            'created_at' => 'datetime',
        ];
    }

    public function document(): BelongsTo
    {
        return $this->belongsTo(Document::class);
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
