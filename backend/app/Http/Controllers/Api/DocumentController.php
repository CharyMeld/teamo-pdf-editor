<?php

namespace App\Http\Controllers\Api;

use App\Domain\Audit\Services\AuditLogger;
use App\Domain\Editing\Services\WorkingCopyManager;
use App\Domain\Rendering\Services\DocumentThumbnailRenderer;
use App\Exceptions\DocumentValidationException;
use App\Http\Controllers\Controller;
use App\Jobs\GenerateDocumentThumbnails;
use App\Models\Document;
use App\Models\DocumentJob;
use App\Models\DocumentPage;
use App\Models\DocumentVersion;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Throwable;

/**
 * OPEN → VALIDATE → LOAD → RENDER for a real PDF (Phase 2). See
 * ARCHITECTURE.md's Phase 2 section for the full request/response
 * contract and the password-handling design.
 */
class DocumentController extends Controller
{
    /**
     * Phase 13: optional `?q=` searches title/original_filename — the
     * default (no param) behavior every existing caller relies on
     * (the "Open recent" quick-pick, and this endpoint's own original
     * use) is unchanged.
     */
    public function index(Request $request): JsonResponse
    {
        $query = Document::where('user_id', $request->user()->id);

        $search = trim((string) $request->query('q', ''));
        if ($search !== '') {
            $query->where(fn ($q) => $q->where('title', 'like', "%{$search}%")
                ->orWhere('original_filename', 'like', "%{$search}%"));
        }

        $documents = $query->orderByDesc('created_at')
            ->get()
            ->map(fn (Document $d) => $this->serializeDocument($d));

        return response()->json(['data' => $documents]);
    }

    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'file' => ['required', 'file'],
        ]);

        /** @var \Illuminate\Http\UploadedFile $file */
        $file = $request->file('file');

        $maxMb = (int) config('documents.max_upload_mb', 100);
        if ($file->getSize() > $maxMb * 1024 * 1024) {
            throw DocumentValidationException::oversized($maxMb);
        }

        // Real content-based MIME sniff — never trust the client-supplied
        // extension or Content-Type header (see ARCHITECTURE.md's upload
        // security rules).
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $realMime = $finfo ? finfo_file($finfo, $file->getRealPath()) : false;
        if ($finfo) {
            finfo_close($finfo);
        }
        if ($realMime !== 'application/pdf') {
            throw DocumentValidationException::unsupportedType();
        }

        $probe = Process::timeout(30)->run(['pdfinfo', $file->getRealPath()]);
        // A PDF whose *open* password is set (not just permissions/owner
        // password) makes `pdfinfo` exit non-zero even with no password
        // supplied — poppler can't read any metadata at all in that case.
        // That is a real, valid password-protected PDF, not a corrupted
        // one; only other pdfinfo failures (syntax/trailer errors, a
        // truncated file, etc.) mean the file is actually unreadable.
        $requiresPassword = ! $probe->successful() && str_contains($probe->errorOutput(), 'Incorrect password');

        if (! $probe->successful() && ! $requiresPassword) {
            throw DocumentValidationException::corrupted();
        }

        $isEncrypted = $requiresPassword || (bool) preg_match('/^Encrypted:\s+yes/mi', $probe->output());
        if (! $isEncrypted && preg_match('/^Pages:\s+(\d+)/m', $probe->output()) !== 1) {
            throw DocumentValidationException::corrupted();
        }

        $uuid = (string) Str::uuid();
        $checksum = hash_file('sha256', $file->getRealPath());
        $storagePath = "{$uuid}/original/original.pdf";
        Storage::disk('documents')->put($storagePath, file_get_contents($file->getRealPath()));

        $document = Document::create([
            'uuid' => $uuid,
            'user_id' => $request->user()->id,
            'title' => pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME) ?: 'Untitled',
            'original_filename' => $file->getClientOriginalName(),
            'mime_type' => 'application/pdf',
            'size_bytes' => $file->getSize(),
            'status' => $isEncrypted ? 'password_protected' : 'processing',
        ]);

        $version = DocumentVersion::create([
            'document_id' => $document->id,
            'version_number' => 1,
            'storage_disk' => 'documents',
            'storage_path' => $storagePath,
            'size_bytes' => $file->getSize(),
            'checksum_sha256' => $checksum,
            'created_by' => $request->user()->id,
            'is_current' => true,
            'created_at' => now(),
        ]);

        AuditLogger::record('document.uploaded', $document, ['encrypted' => $isEncrypted]);

        if (! $isEncrypted) {
            $job = DocumentJob::create([
                'document_id' => $document->id,
                'job_type' => 'thumbnail_generation',
                'status' => 'queued',
                'created_by' => $request->user()->id,
            ]);
            GenerateDocumentThumbnails::dispatch($document->id, $version->id, $job->id);
        }

        return response()->json($this->serializeDocument($document->fresh()), 201);
    }

    public function show(Request $request, Document $document): JsonResponse
    {
        $this->authorizeOwner($request, $document);
        AuditLogger::record('document.opened', $document);

        return response()->json($this->serializeDocument($document));
    }

    /** Lightweight polling endpoint — no audit log per call. */
    public function status(Request $request, Document $document): JsonResponse
    {
        $this->authorizeOwner($request, $document);

        return response()->json($this->serializeDocument($document));
    }

    public function pages(Request $request, Document $document): JsonResponse
    {
        $this->authorizeOwner($request, $document);

        $version = $document->currentVersion;
        if (! $version) {
            return response()->json(['data' => []]);
        }

        $pages = $version->pages()->orderBy('page_number')->get()->map(fn (DocumentPage $p) => [
            'pageNumber' => $p->page_number,
            'widthPt' => $p->width_pt,
            'heightPt' => $p->height_pt,
            'rotationDegrees' => $p->rotation_degrees,
            'thumbnailReady' => $p->thumbnail_path !== null,
        ]);

        return response()->json(['data' => $pages]);
    }

    public function file(Request $request, Document $document): BinaryFileResponse
    {
        $this->authorizeOwner($request, $document);
        abort_if($document->status === 'password_protected', 423, 'This document is locked.');

        $version = $document->currentVersion ?? $document->versions()->where('version_number', 1)->first();
        abort_if(! $version, 404);

        $absolutePath = Storage::disk($version->storage_disk)->path($version->storage_path);
        abort_unless(is_file($absolutePath), 404);

        return response()->file($absolutePath, ['Content-Type' => 'application/pdf']);
    }

    public function thumbnail(Request $request, Document $document, int $pageNumber): BinaryFileResponse|JsonResponse
    {
        $this->authorizeOwner($request, $document);

        $version = $document->currentVersion;
        $page = $version?->pages()->where('page_number', $pageNumber)->first();

        if (! $page || ! $page->thumbnail_path) {
            return response()->json([
                'error' => ['message' => 'Thumbnail not ready yet.', 'code' => 404],
            ], 404);
        }

        $absolutePath = Storage::disk('documents')->path($page->thumbnail_path);
        abort_unless(is_file($absolutePath), 404);

        return response()->file($absolutePath, ['Content-Type' => 'image/png']);
    }

    public function unlock(Request $request, Document $document, DocumentThumbnailRenderer $renderer): JsonResponse
    {
        $this->authorizeOwner($request, $document);
        $request->validate(['password' => ['required', 'string']]);

        if ($document->status !== 'password_protected') {
            throw DocumentValidationException::notPasswordProtected();
        }

        $version = $document->versions()->where('version_number', 1)->firstOrFail();
        $absolutePath = Storage::disk($version->storage_disk)->path($version->storage_path);
        $password = $request->string('password')->toString();

        $check = Process::timeout(30)->run(['pdfinfo', '-upw', $password, $absolutePath]);
        if (! $check->successful() || preg_match('/^Pages:\s+(\d+)/m', $check->output()) !== 1) {
            AuditLogger::record('document.unlock_failed', $document);
            throw DocumentValidationException::incorrectPassword();
        }

        AuditLogger::record('document.unlocked', $document);

        $job = DocumentJob::create([
            'document_id' => $document->id,
            'job_type' => 'thumbnail_generation',
            'status' => 'queued',
            'created_by' => $request->user()->id,
        ]);

        // Run synchronously — deliberately NOT queued, so the password
        // (held only in the local $password variable above) never has to
        // be serialized into the `jobs` table. See
        // DocumentThumbnailRenderer's docblock.
        try {
            $renderer->render($document, $version, $password, $job);
        } catch (Throwable $e) {
            $document->update(['status' => 'failed']);
            $job->update([
                'status' => 'failed',
                'error_message' => 'Rendering failed after unlock.',
                'completed_at' => now(),
            ]);
            report($e);
        }

        return response()->json($this->serializeDocument($document->fresh()));
    }

    /** Phase 13 (document management). */
    public function update(Request $request, Document $document): JsonResponse
    {
        $this->authorizeOwner($request, $document);
        $data = $request->validate(['title' => ['required', 'string', 'max:255']]);

        $document->update(['title' => $data['title']]);
        AuditLogger::record('document.renamed', $document, ['title' => $data['title']], $request);

        return response()->json($this->serializeDocument($document));
    }

    /** Soft delete — Document::SoftDeletes already excludes trashed rows from every existing query, so no other code needs to change. */
    public function destroy(Request $request, Document $document): JsonResponse
    {
        $this->authorizeOwner($request, $document);

        $document->delete();
        AuditLogger::record('document.deleted', $document, [], $request);

        return response()->json(['deleted' => true]);
    }

    /**
     * A real, independent copy: a brand-new Document + first version,
     * via the exact same primitive Phase 6/8 use to turn a produced
     * file into a new document — see WorkingCopyManager's docblock.
     */
    public function duplicate(Request $request, Document $document, WorkingCopyManager $working): JsonResponse
    {
        $this->authorizeOwner($request, $document);

        $version = $document->currentVersion ?? $document->versions()->where('version_number', 1)->first();
        abort_if(! $version, 404);
        $absolutePath = Storage::disk($version->storage_disk)->path($version->storage_path);
        abort_unless(is_file($absolutePath), 404);

        $copy = $working->createDocumentFromFile(
            $request->user(),
            $absolutePath,
            "{$document->title} (copy)",
            $document->original_filename,
        );

        AuditLogger::record('document.duplicated', $document, ['copyId' => $copy->uuid], $request);

        return response()->json($this->serializeDocument($copy), 201);
    }

    /** Same file resolution as file(), but a real attachment download instead of an inline response — file() itself is untouched since the PDF viewer needs its current inline behavior. */
    public function download(Request $request, Document $document): BinaryFileResponse
    {
        $this->authorizeOwner($request, $document);
        abort_if($document->status === 'password_protected', 423, 'This document is locked.');

        $version = $document->currentVersion ?? $document->versions()->where('version_number', 1)->first();
        abort_if(! $version, 404);
        $absolutePath = Storage::disk($version->storage_disk)->path($version->storage_path);
        abort_unless(is_file($absolutePath), 404);

        AuditLogger::record('document.downloaded', $document, [], $request);

        return response()->download($absolutePath, $document->original_filename);
    }

    public function archive(Request $request, Document $document): JsonResponse
    {
        $this->authorizeOwner($request, $document);
        abort_unless($document->status === 'ready', 422, 'Only a ready document can be archived.');

        $document->update(['status' => 'archived']);
        AuditLogger::record('document.archived', $document, [], $request);

        return response()->json($this->serializeDocument($document));
    }

    public function unarchive(Request $request, Document $document): JsonResponse
    {
        $this->authorizeOwner($request, $document);
        abort_unless($document->status === 'archived', 422, 'Only an archived document can be unarchived.');

        $document->update(['status' => 'ready']);
        AuditLogger::record('document.unarchived', $document, [], $request);

        return response()->json($this->serializeDocument($document));
    }

    public function versions(Request $request, Document $document): JsonResponse
    {
        $this->authorizeOwner($request, $document);

        $versions = $document->versions()->orderByDesc('version_number')->get()->map(fn (DocumentVersion $v) => [
            'versionNumber' => $v->version_number,
            'sizeBytes' => $v->size_bytes,
            'createdAt' => $v->created_at?->toIso8601String(),
            'isCurrent' => $v->is_current,
        ]);

        return response()->json(['data' => $versions]);
    }

    public function history(Request $request, Document $document): JsonResponse
    {
        $this->authorizeOwner($request, $document);

        $jobs = $document->jobs()->orderByDesc('created_at')->get()->map(fn (DocumentJob $j) => [
            'jobType' => $j->job_type,
            'status' => $j->status,
            'progressPercent' => $j->progress_percent,
            'createdAt' => $j->created_at?->toIso8601String(),
            'completedAt' => $j->completed_at?->toIso8601String(),
            'errorMessage' => $j->error_message,
        ]);

        return response()->json(['data' => $jobs]);
    }

    private function authorizeOwner(Request $request, Document $document): void
    {
        abort_if($document->user_id !== $request->user()->id, 403);
    }

    private function serializeDocument(Document $document): array
    {
        return $document->toSummaryArray();
    }
}
