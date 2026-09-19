<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Phase 12.3 (AI provider settings): one row per user+provider,
     * `api_key` encrypted at rest via the model's `encrypted` cast
     * (App\Models\AiProviderCredential) — no separate crypto code, uses
     * the app's existing APP_KEY. `user_id` is nullable/`nullOnDelete`
     * to match every other table's convention even though this app has
     * exactly one seeded user today (see ARCHITECTURE.md's Phase 12.1
     * audit).
     */
    public function up(): void
    {
        Schema::create('ai_provider_credentials', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('provider');
            $table->text('api_key');
            $table->string('model')->nullable();
            $table->boolean('enabled')->default(true);
            $table->timestamp('last_tested_at')->nullable();
            $table->string('last_test_status')->nullable();
            $table->string('last_test_message')->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'provider']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_provider_credentials');
    }
};
