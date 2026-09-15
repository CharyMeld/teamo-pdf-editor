<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Phase 3 (Organize / page management): the real "working copy" the
     * document state model (ARCHITECTURE.md) deferred until an editing
     * module had logic. Each row is one applied page operation and the
     * real PDF snapshot it produced — undo/redo just moves the document's
     * `current_step_id` pointer through this table; it never rewrites or
     * deletes a row except when a new operation is applied while not at
     * the tip (the abandoned "redo" branch is deleted, same as a text
     * editor's undo stack).
     */
    public function up(): void
    {
        Schema::create('document_edit_operations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('document_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('sequence_number');
            $table->string('operation_type');
            $table->json('payload');
            $table->string('resulting_storage_path');
            $table->unsignedInteger('page_count_after');
            $table->json('pages_snapshot')->nullable();
            $table->foreignId('created_by')->constrained('users')->cascadeOnDelete();
            $table->timestamp('created_at')->useCurrent();

            $table->unique(['document_id', 'sequence_number']);
        });

        Schema::table('documents', function (Blueprint $table) {
            $table->foreignId('current_step_id')->nullable()->after('page_count')
                ->constrained('document_edit_operations')->nullOnDelete();
            $table->foreignId('base_version_id')->nullable()->after('current_step_id')
                ->constrained('document_versions')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('documents', function (Blueprint $table) {
            $table->dropConstrainedForeignId('current_step_id');
            $table->dropConstrainedForeignId('base_version_id');
        });

        Schema::dropIfExists('document_edit_operations');
    }
};
