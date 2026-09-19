<?php

namespace Tests\Feature;

use App\Models\Document;
use App\Models\DocumentVersion;
use App\Models\ScanSession;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Phase 14 hardening: real app-level upload size/type limits added to
 * endpoints that previously had none (see ARCHITECTURE.md's Phase 14
 * section). `UploadedFile::fake()` injects a test double directly into
 * Laravel's validator, bypassing PHP's real multipart upload pipeline
 * entirely — this is deliberate here, not a shortcut: this dev
 * environment's `upload_max_filesize` ini value (2MB) is far below
 * both the new 20MB image-upload limit and the existing 100MB PDF
 * limit, so a REAL oversized HTTP upload can't reach Laravel's own
 * validation layer to prove this fix at all (confirmed by hand:  a real
 * 27MB curl upload killed the dev server's connection before Laravel
 * ever saw the request). Testing the validation rule directly is the
 * only way to actually exercise it in this environment.
 */
class Phase14UploadLimitsTest extends TestCase
{
    use DatabaseTransactions;

    private array $createdStoragePaths = [];

    protected function tearDown(): void
    {
        foreach ($this->createdStoragePaths as $path) {
            Storage::disk('documents')->deleteDirectory(explode('/', $path)[0]);
        }
        parent::tearDown();
    }

    private function makeDocumentWithFile(User $user): Document
    {
        $uuid = (string) Str::uuid();
        $storagePath = "{$uuid}/versions/1/document.pdf";
        // A real, valid, qpdf-clean single-page PDF (tests/Fixtures/minimal.pdf)
        // — not a fake byte string — since the "accepts a file under the
        // limit" happy-path test exercises the real FPDI compose pipeline,
        // which needs an actual parseable PDF (a plain string here fails
        // with "Unable to find pointer to xref table").
        Storage::disk('documents')->put($storagePath, file_get_contents(__DIR__.'/../Fixtures/minimal.pdf'));
        $this->createdStoragePaths[] = $storagePath;

        $document = Document::create([
            'uuid' => $uuid,
            'user_id' => $user->id,
            'title' => 'Test Doc',
            'original_filename' => 'test.pdf',
            'mime_type' => 'application/pdf',
            'size_bytes' => 100,
            'status' => 'ready',
            'page_count' => 3,
        ]);

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

    public function test_content_object_image_insert_rejects_an_oversized_file(): void
    {
        $user = User::factory()->create();
        $doc = $this->makeDocumentWithFile($user);
        $oversized = UploadedFile::fake()->create('big.png', 21 * 1024, 'image/png');

        $response = $this->actingAs($user)->post("/api/documents/{$doc->uuid}/content/objects", [
            'type' => 'image',
            'page' => 1,
            'x' => 0,
            'y' => 0,
            'width' => 50,
            'height' => 50,
            'file' => $oversized,
        ]);

        $response->assertStatus(422);
        $response->assertJsonStructure(['error' => ['fields' => ['file']]]);
    }

    public function test_content_object_image_insert_accepts_a_file_under_the_limit(): void
    {
        $user = User::factory()->create();
        $doc = $this->makeDocumentWithFile($user);
        $fine = UploadedFile::fake()->image('small.png', 10, 10);

        $response = $this->actingAs($user)->post("/api/documents/{$doc->uuid}/content/objects", [
            'type' => 'image',
            'page' => 1,
            'x' => 0,
            'y' => 0,
            'width' => 50,
            'height' => 50,
            'file' => $fine,
        ]);

        $response->assertStatus(201);
    }

    public function test_stamp_annotation_upload_rejects_an_oversized_file(): void
    {
        $user = User::factory()->create();
        $doc = $this->makeDocumentWithFile($user);
        $oversized = UploadedFile::fake()->create('big.png', 21 * 1024, 'image/png');

        $response = $this->actingAs($user)->post("/api/documents/{$doc->uuid}/annotations", [
            'type' => 'stamp',
            'page' => 1,
            'x' => 0,
            'y' => 0,
            'width' => 50,
            'height' => 50,
            'file' => $oversized,
        ]);

        $response->assertStatus(422);
        $response->assertJsonStructure(['error' => ['fields' => ['file']]]);
    }

    public function test_scan_session_add_images_rejects_an_oversized_file(): void
    {
        $user = User::factory()->create();
        $session = ScanSession::create(['uuid' => (string) Str::uuid(), 'user_id' => $user->id, 'status' => 'draft']);
        $oversized = UploadedFile::fake()->create('big.png', 21 * 1024, 'image/png');

        $response = $this->actingAs($user)->post("/api/scan-sessions/{$session->uuid}/images", [
            'images' => [$oversized],
        ]);

        $response->assertStatus(422);
    }

    public function test_office_conversion_rejects_a_non_docx_file(): void
    {
        $user = User::factory()->create();
        $notDocx = UploadedFile::fake()->create('document.txt', 10, 'text/plain');

        $response = $this->actingAs($user)->post('/api/office-conversions', ['file' => $notDocx]);

        $response->assertStatus(422);
        $response->assertJsonStructure(['error' => ['fields' => ['file']]]);
    }

    public function test_office_conversion_rejects_an_oversized_docx(): void
    {
        $user = User::factory()->create();
        $oversized = UploadedFile::fake()->create(
            'big.docx',
            101 * 1024,
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        );

        $response = $this->actingAs($user)->post('/api/office-conversions', ['file' => $oversized]);

        $response->assertStatus(422);
        $response->assertJsonStructure(['error' => ['fields' => ['file']]]);
    }
}
