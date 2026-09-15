<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('document_pages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('document_version_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('page_number');
            $table->float('width_pt');
            $table->float('height_pt');
            $table->smallInteger('rotation_degrees')->default(0);
            $table->timestamp('created_at')->useCurrent();

            $table->unique(['document_version_id', 'page_number']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('document_pages');
    }
};
