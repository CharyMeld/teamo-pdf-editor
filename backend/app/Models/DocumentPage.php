<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DocumentPage extends Model
{
    use HasFactory;

    public $timestamps = false;

    protected $fillable = [
        'document_version_id',
        'page_number',
        'width_pt',
        'height_pt',
        'rotation_degrees',
        'thumbnail_path',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'page_number' => 'integer',
            'width_pt' => 'float',
            'height_pt' => 'float',
            'rotation_degrees' => 'integer',
            'created_at' => 'datetime',
        ];
    }

    public function documentVersion(): BelongsTo
    {
        return $this->belongsTo(DocumentVersion::class);
    }
}
