<?php

namespace Tests\Feature\Documents;

use App\Models\Document;
use App\Models\DocumentJob;
use App\Models\DocumentVersion;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Phase 13 (document management). Every mutating/reading endpoint here
 * reuses the same `documents` storage disk every other phase writes
 * to (no separate test disk is configured — see phpunit.xml), so this
 * class tears down every physical file it creates, in addition to
 * DatabaseTransactions for the DB rows.
 */
class DocumentManagementControllerTest extends TestCase
{
    use DatabaseTransactions;

    private array $createdStoragePaths = [];

    protected function tearDown(): void
    {
        // Delete the whole top-level UUID directory, not just the
        // immediate parent of the stored file — `dirname()` alone left
        // an empty `{uuid}/` behind every run (caught by actually
        // checking the storage directory grew after a test run, not
        // assumed clean because DatabaseTransactions rolled back the
        // DB rows).
        foreach ($this->createdStoragePaths as $path) {
            $topLevelDir = explode('/', $path)[0];
            Storage::disk('documents')->deleteDirectory($topLevelDir);
        }
        parent::tearDown();
    }

    private function makeDocumentWithFile(User $user, array $overrides = []): Document
    {
        $uuid = (string) Str::uuid();
        $storagePath = "{$uuid}/versions/1/document.pdf";
        Storage::disk('documents')->put($storagePath, '%PDF-1.4 fake test content');
        $this->createdStoragePaths[] = $storagePath;

        $document = Document::create(array_merge([
            'uuid' => $uuid,
            'user_id' => $user->id,
            'title' => 'Test Doc',
            'original_filename' => 'test.pdf',
            'mime_type' => 'application/pdf',
            'size_bytes' => 100,
            'status' => 'ready',
        ], $overrides));

        DocumentVersion::create([
            'document_id' => $document->id,
            'version_number' => 1,
            'storage_disk' => 'documents',
            'storage_path' => $storagePath,
            'size_bytes' => 100,
            'checksum_sha256' => 'x',
            'created_by' => $user->id,
            'is_current' => true,
            'created_at' => now(),
        ]);

        return $document->fresh();
    }

    public function test_index_search_filters_by_title(): void
    {
        $user = User::factory()->create();
        $this->makeDocumentWithFile($user, ['title' => 'Invoice March']);
        $this->makeDocumentWithFile($user, ['title' => 'Receipt April']);

        $response = $this->actingAs($user)->getJson('/api/documents?q=invoice');

        $response->assertOk();
        $response->assertJsonCount(1, 'data');
        $response->assertJsonPath('data.0.title', 'Invoice March');
    }

    public function test_rename_updates_the_title(): void
    {
        $user = User::factory()->create();
        $doc = $this->makeDocumentWithFile($user);

        $response = $this->actingAs($user)->patchJson("/api/documents/{$doc->uuid}", ['title' => 'New Title']);

        $response->assertOk();
        $response->assertJsonPath('title', 'New Title');
        $this->assertSame('New Title', $doc->fresh()->title);
    }

    public function test_rename_rejects_another_users_document(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $doc = $this->makeDocumentWithFile($owner);

        $response = $this->actingAs($other)->patchJson("/api/documents/{$doc->uuid}", ['title' => 'Hijacked']);

        $response->assertStatus(403);
        $this->assertSame('Test Doc', $doc->fresh()->title);
    }

    public function test_delete_soft_deletes_and_excludes_from_index(): void
    {
        $user = User::factory()->create();
        $doc = $this->makeDocumentWithFile($user);

        $response = $this->actingAs($user)->deleteJson("/api/documents/{$doc->uuid}");
        $response->assertOk();

        $this->assertSoftDeleted($doc);
        $list = $this->actingAs($user)->getJson('/api/documents');
        $list->assertJsonCount(0, 'data');
    }

    public function test_duplicate_creates_a_real_independent_document(): void
    {
        $user = User::factory()->create();
        $doc = $this->makeDocumentWithFile($user, ['title' => 'Original']);

        $response = $this->actingAs($user)->postJson("/api/documents/{$doc->uuid}/duplicate");

        $response->assertCreated();
        $response->assertJsonPath('title', 'Original (copy)');
        $newId = $response->json('id');
        $this->assertNotSame($doc->uuid, $newId);

        $copy = Document::where('uuid', $newId)->first();
        $this->createdStoragePaths[] = "{$copy->uuid}/original/original.pdf";
        $this->assertNotNull($copy);
        $this->assertNotSame($doc->id, $copy->id);
    }

    public function test_download_returns_a_real_attachment(): void
    {
        $user = User::factory()->create();
        $doc = $this->makeDocumentWithFile($user);

        $response = $this->actingAs($user)->get("/api/documents/{$doc->uuid}/download");

        $response->assertOk();
        $response->assertHeader('content-disposition');
        $this->assertStringContainsString('attachment', $response->headers->get('content-disposition'));
    }

    public function test_archive_then_unarchive_round_trips(): void
    {
        $user = User::factory()->create();
        $doc = $this->makeDocumentWithFile($user);

        $archived = $this->actingAs($user)->postJson("/api/documents/{$doc->uuid}/archive");
        $archived->assertOk();
        $archived->assertJsonPath('status', 'archived');
        $archived->assertJsonPath('lifecycleState', 'archived');

        $unarchived = $this->actingAs($user)->postJson("/api/documents/{$doc->uuid}/unarchive");
        $unarchived->assertOk();
        $unarchived->assertJsonPath('status', 'ready');
    }

    public function test_archive_rejects_a_non_ready_document(): void
    {
        $user = User::factory()->create();
        $doc = $this->makeDocumentWithFile($user, ['status' => 'processing']);

        $response = $this->actingAs($user)->postJson("/api/documents/{$doc->uuid}/archive");

        $response->assertStatus(422);
    }

    public function test_versions_lists_real_version_rows(): void
    {
        $user = User::factory()->create();
        $doc = $this->makeDocumentWithFile($user);

        $response = $this->actingAs($user)->getJson("/api/documents/{$doc->uuid}/versions");

        $response->assertOk();
        $response->assertJsonCount(1, 'data');
        $response->assertJsonPath('data.0.versionNumber', 1);
        $response->assertJsonPath('data.0.isCurrent', true);
    }

    public function test_history_lists_real_job_rows(): void
    {
        $user = User::factory()->create();
        $doc = $this->makeDocumentWithFile($user);
        DocumentJob::create([
            'document_id' => $doc->id,
            'job_type' => 'thumbnail_generation',
            'status' => 'completed',
            'created_by' => $user->id,
        ]);

        $response = $this->actingAs($user)->getJson("/api/documents/{$doc->uuid}/history");

        $response->assertOk();
        $response->assertJsonCount(1, 'data');
        $response->assertJsonPath('data.0.jobType', 'thumbnail_generation');
    }

    public function test_other_users_document_returns_403_for_versions_and_history(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $doc = $this->makeDocumentWithFile($owner);

        $this->actingAs($other)->getJson("/api/documents/{$doc->uuid}/versions")->assertStatus(403);
        $this->actingAs($other)->getJson("/api/documents/{$doc->uuid}/history")->assertStatus(403);
        $this->actingAs($other)->deleteJson("/api/documents/{$doc->uuid}")->assertStatus(403);
        $this->actingAs($other)->postJson("/api/documents/{$doc->uuid}/duplicate")->assertStatus(403);
    }
}
