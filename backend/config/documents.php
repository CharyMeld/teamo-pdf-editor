<?php

// Documents module runtime configuration — see ARCHITECTURE.md's "Upload
// security rules". Kept out of filesystems.php because it's policy, not
// disk wiring.
return [
    'max_upload_mb' => (int) env('DOCUMENTS_MAX_UPLOAD_MB', 100),

    'thumbnail_dpi' => (int) env('DOCUMENTS_THUMBNAIL_DPI', 110),

    // Phase 7 (OCR): higher than thumbnail DPI on purpose — real text
    // recognition accuracy needs more detail than a UI thumbnail does.
    'ocr_dpi' => (int) env('DOCUMENTS_OCR_DPI', 300),
];
