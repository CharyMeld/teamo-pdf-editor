<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Phase 2 (PDF viewing/rendering): a document can be uploaded but
     * locked (`password_protected`) until unlocked, and once rendered we
     * cache its page count for cheap header/status-bar display without a
     * join. `document_pages.thumbnail_path` records where the Rendering
     * module wrote each page's real raster thumbnail.
     */
    public function up(): void
    {
        // Raw SQL: changing a MySQL ENUM's value set isn't supported by
        // Schema::table()->change() without doctrine/dbal, which this
        // project doesn't depend on.
        DB::statement(
            "ALTER TABLE documents MODIFY status ENUM(
                'uploading',
                'validating',
                'ready',
                'processing',
                'password_protected',
                'failed',
                'archived'
            ) NOT NULL DEFAULT 'uploading'"
        );

        Schema::table('documents', function (Blueprint $table) {
            $table->unsignedInteger('page_count')->nullable()->after('status');
        });

        Schema::table('document_pages', function (Blueprint $table) {
            $table->string('thumbnail_path')->nullable()->after('rotation_degrees');
        });
    }

    public function down(): void
    {
        Schema::table('document_pages', function (Blueprint $table) {
            $table->dropColumn('thumbnail_path');
        });

        Schema::table('documents', function (Blueprint $table) {
            $table->dropColumn('page_count');
        });

        DB::statement(
            "ALTER TABLE documents MODIFY status ENUM(
                'uploading',
                'validating',
                'ready',
                'processing',
                'failed',
                'archived'
            ) NOT NULL DEFAULT 'uploading'"
        );
    }
};
