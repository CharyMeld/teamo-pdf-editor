<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Phase 7 (OCR): `document_jobs` had no cancellation support anywhere in
 * the codebase before this — no `cancelled` status, no `cancel_requested`
 * flag. OCR is the first job type long-running enough (many pages, real
 * per-page Tesseract calls) that mid-job cancellation is worth offering,
 * so this widens the status enum and adds the request flag OcrService
 * polls between pages. `doctrine/dbal` isn't installed, so the enum
 * widen goes through a raw ALTER rather than Blueprint's `change()`.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE document_jobs MODIFY status ENUM('queued', 'processing', 'completed', 'failed', 'cancelled') NOT NULL DEFAULT 'queued'");

        Schema::table('document_jobs', function (Blueprint $table) {
            $table->boolean('cancel_requested')->default(false)->after('status');
        });
    }

    public function down(): void
    {
        Schema::table('document_jobs', function (Blueprint $table) {
            $table->dropColumn('cancel_requested');
        });

        DB::statement("ALTER TABLE document_jobs MODIFY status ENUM('queued', 'processing', 'completed', 'failed') NOT NULL DEFAULT 'queued'");
    }
};
