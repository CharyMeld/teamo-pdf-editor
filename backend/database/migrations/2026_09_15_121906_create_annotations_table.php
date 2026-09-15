<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('annotations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('document_version_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('page_number');
            $table->string('type');
            $table->json('data');
            $table->timestamps();

            $table->index(['document_version_id', 'page_number']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('annotations');
    }
};
