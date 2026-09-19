<?php

// Documents module runtime configuration — see ARCHITECTURE.md's "Upload
// security rules". Kept out of filesystems.php because it's policy, not
// disk wiring.
return [
    'max_upload_mb' => (int) env('DOCUMENTS_MAX_UPLOAD_MB', 100),

    // Phase 14 hardening: the main PDF upload has always enforced this,
    // but inserted images (content-editor image insert, stamp
    // annotations, scan-session images) had no app-level size limit at
    // all — only PHP's ini backstop (upload_max_filesize/post_max_size).
    // An inserted image is always far smaller than a full document; 20MB
    // is generous headroom, not a tight bound.
    'max_image_upload_mb' => (int) env('DOCUMENTS_MAX_IMAGE_UPLOAD_MB', 20),

    'thumbnail_dpi' => (int) env('DOCUMENTS_THUMBNAIL_DPI', 110),

    // Phase 7 (OCR): higher than thumbnail DPI on purpose — real text
    // recognition accuracy needs more detail than a UI thumbnail does.
    'ocr_dpi' => (int) env('DOCUMENTS_OCR_DPI', 300),

    // Phase 8 (conversion): PDF -> Images export DPI — higher than the
    // thumbnail DPI since these are meant to be used as real standalone
    // images, not just a UI preview, but lower than OCR's 300 since
    // there's no recognition accuracy to protect here.
    'conversion_image_dpi' => (int) env('DOCUMENTS_CONVERSION_IMAGE_DPI', 150),
];
