<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Phase 6 (scanning/image-import): a scan session holds the images a user
 * is combining into a new PDF, BEFORE any `Document` exists — so this
 * can't reuse `document_edit_operations` the way Phase 4/5 do. Mirrors
 * their same "never touch the clean source" principle instead: every
 * cleanup adjustment lives in `params` only, applied fresh from
 * `original_storage_path` (never overwritten) each time a preview or the
 * final PDF is rendered.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('scan_sessions', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->enum('status', ['draft', 'creating', 'completed', 'failed'])->default('draft');
            $table->foreignId('created_document_id')->nullable()->constrained('documents')->nullOnDelete();
            $table->timestamps();

            $table->index('user_id');
        });

        Schema::create('scan_session_images', function (Blueprint $table) {
            $table->id();
            $table->foreignId('scan_session_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('position');
            $table->string('original_storage_path');
            $table->string('original_filename');
            $table->unsignedInteger('original_width_px');
            $table->unsignedInteger('original_height_px');
            $table->json('params');
            $table->boolean('blank_page_detected')->default(false);
            $table->timestamps();

            $table->index(['scan_session_id', 'position']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('scan_session_images');
        Schema::dropIfExists('scan_sessions');
    }
};
