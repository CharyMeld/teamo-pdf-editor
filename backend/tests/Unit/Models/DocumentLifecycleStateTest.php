<?php

namespace Tests\Unit\Models;

use App\Models\Document;
use App\Models\DocumentEditOperation;
use App\Models\DocumentVersion;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Phase 13: `Document::lifecycleState()` is a purely presentational
 * label, distinct from the real `status` column — see the model's
 * docblock for why the two are kept separate.
 */
class DocumentLifecycleStateTest extends TestCase
{
    use DatabaseTransactions;

    private function makeDocument(array $overrides = []): Document
    {
        $user = User::factory()->create();

        return Document::create(array_merge([
            'uuid' => (string) Str::uuid(),
            'user_id' => $user->id,
            'title' => 'Test Doc',
            'original_filename' => 'test.pdf',
            'mime_type' => 'application/pdf',
            'size_bytes' => 100,
            'status' => 'ready',
        ], $overrides));
    }

    public function test_processing_statuses_map_to_processing(): void
    {
        foreach (['uploading', 'validating', 'processing'] as $status) {
            $doc = $this->makeDocument(['status' => $status]);
            $this->assertSame('processing', $doc->lifecycleState());
        }
    }

    public function test_failed_archived_and_password_protected_pass_through(): void
    {
        $this->assertSame('failed', $this->makeDocument(['status' => 'failed'])->lifecycleState());
        $this->assertSame('archived', $this->makeDocument(['status' => 'archived'])->lifecycleState());
        $this->assertSame('password_protected', $this->makeDocument(['status' => 'password_protected'])->lifecycleState());
    }

    public function test_ready_with_no_saved_version_is_original(): void
    {
        $doc = $this->makeDocument();
        DocumentVersion::create([
            'document_id' => $doc->id,
            'version_number' => 1,
            'storage_disk' => 'documents',
            'storage_path' => 'x',
            'size_bytes' => 1,
            'checksum_sha256' => 'x',
            'created_by' => $doc->user_id,
            'is_current' => true,
            'created_at' => now(),
        ]);

        $this->assertSame('original', $doc->lifecycleState());
    }

    public function test_ready_with_a_second_saved_version_is_saved(): void
    {
        $doc = $this->makeDocument();
        foreach ([1, 2] as $n) {
            DocumentVersion::create([
                'document_id' => $doc->id,
                'version_number' => $n,
                'storage_disk' => 'documents',
                'storage_path' => "v{$n}",
                'size_bytes' => 1,
                'checksum_sha256' => "v{$n}",
                'created_by' => $doc->user_id,
                'is_current' => $n === 2,
                'created_at' => now(),
            ]);
        }

        $this->assertSame('saved', $doc->lifecycleState());
    }

    public function test_ready_with_pending_edits_is_working_even_if_saved_before(): void
    {
        $doc = $this->makeDocument();
        $step = DocumentEditOperation::create([
            'document_id' => $doc->id,
            'sequence_number' => 1,
            'operation_type' => 'content_add_text',
            'payload' => [],
            'resulting_storage_path' => 'x',
            'page_count_after' => 1,
            'created_by' => $doc->user_id,
        ]);
        $doc->update(['current_step_id' => $step->id]);

        $this->assertSame('working', $doc->lifecycleState());
    }
}
