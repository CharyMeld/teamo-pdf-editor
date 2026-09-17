<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ScanSessionImage extends Model
{
    protected $fillable = [
        'scan_session_id',
        'position',
        'original_storage_path',
        'original_filename',
        'original_width_px',
        'original_height_px',
        'params',
        'blank_page_detected',
    ];

    protected function casts(): array
    {
        return [
            'position' => 'integer',
            'original_width_px' => 'integer',
            'original_height_px' => 'integer',
            'params' => 'array',
            'blank_page_detected' => 'boolean',
        ];
    }

    public function scanSession(): BelongsTo
    {
        return $this->belongsTo(ScanSession::class);
    }
}
