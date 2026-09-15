<?php

namespace App\Domain\Editing\Services;

use App\Domain\Audit\Services\AuditLogger;
use App\Exceptions\PageOperationException;
use App\Jobs\GenerateDocumentThumbnails;
use App\Jobs\GenerateWorkingThumbnails;
use App\Models\Document;
use App\Models\DocumentEditOperation;
use App\Models\DocumentJob;
use App\Models\DocumentVersion;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Owns the "working copy" the document state model (ARCHITECTURE.md)
 * defined at Phase 0 and deferred until now. A working copy is a chain of
 * `document_edit_operations` rows, each holding the real PDF snapshot that
 * operation produced; `documents.current_step_id` is a pointer into that
 * chain (null = no pending edits, the working state IS the base version).
 *
 * Undo/redo is just moving the pointer. Applying a NEW operation while the
 * pointer isn't at the tip deletes the abandoned steps ahead of it first —
 * the same semantics as a text editor's undo stack.
 */
class WorkingCopyManager
{
    /** Absolute path to the document's current working PDF (base version, or the current step's snapshot). */
    public function currentAbsolutePath(Document $document): string
    {
        if ($document->current_step_id !== null) {
            $step = $document->currentStep;
            $absolute = Storage::disk('documents')->path($step->resulting_storage_path);
            if (! is_file($absolute)) {
                throw PageOperationException::processingFailed('the current working file is missing.');
            }

            return $absolute;
        }

        $version = $this->baseVersion($document);

        return Storage::disk($version->storage_disk)->path($version->storage_path);
    }

    public function currentPageCount(Document $document): int
    {
        if ($document->current_step_id !== null) {
            return $document->currentStep->page_count_after;
        }

        return $document->page_count ?? $this->baseVersion($document)->pages()->count();
    }

    /**
     * Resolve a step-or-version reference to an absolute file path. Used by
     * the Phase 4 content-editing engine to find the "clean" page-structure
     * source a chain of content-edit operations is composing on top of —
     * see ContentObjectService's docblock for why content edits need this
     * distinct from `currentAbsolutePath()` (which may itself already be a
     * content-composed file).
     */
    public function resolveAbsolutePath(?int $stepId, ?int $versionId): string
    {
        if ($stepId !== null) {
            $step = DocumentEditOperation::findOrFail($stepId);
            $absolute = Storage::disk('documents')->path($step->resulting_storage_path);
            if (! is_file($absolute)) {
                throw PageOperationException::processingFailed('a referenced working-copy step is missing.');
            }

            return $absolute;
        }

        if ($versionId !== null) {
            $version = DocumentVersion::findOrFail($versionId);

            return Storage::disk($version->storage_disk)->path($version->storage_path);
        }

        throw PageOperationException::processingFailed('no source step or version given.');
    }

    /** The version an editing session is (or would be) based on — normally the current saved version. */
    public function baseVersion(Document $document): DocumentVersion
    {
        $version = $document->base_version_id !== null
            ? $document->baseVersion
            : $document->currentVersion;

        if (! $version) {
            throw PageOperationException::documentNotReady();
        }

        return $version;
    }

    /**
     * Finalize a new working-copy step: move the operation's already-built
     * output file into permanent working storage, prune any abandoned
     * "redo" branch, insert the `document_edit_operations` row, advance
     * the document's pointer, and dispatch thumbnail regeneration for it.
     * Returns the new step and the dispatched job (thumbnails are always
     * async here — even a modest regen took ~0.8s/page during testing, so
     * anything beyond a handful of pages risks an HTTP timeout if done
     * inline; the qpdf/gs step itself that produced $builtAbsolutePath is
     * fast enough (well under a second even for 261 pages) to have already
     * run synchronously before this method was called).
     */
    public function commitStep(
        Document $document,
        User $user,
        string $operationType,
        array $payload,
        string $builtAbsolutePath,
        int $newPageCount,
    ): array {
        return DB::transaction(function () use ($document, $user, $operationType, $payload, $builtAbsolutePath, $newPageCount) {
            $document->refresh();

            $currentSequence = $document->currentStep?->sequence_number ?? 0;

            // Redo-branch cut: applying a new operation from a point that isn't
            // the tip discards every step ahead of it, exactly like a text editor.
            $orphaned = DocumentEditOperation::where('document_id', $document->id)
                ->where('sequence_number', '>', $currentSequence)
                ->get();
            foreach ($orphaned as $step) {
                Storage::disk('documents')->delete($step->resulting_storage_path);
                Storage::disk('documents')->deleteDirectory(dirname($step->resulting_storage_path));
            }
            DocumentEditOperation::where('document_id', $document->id)
                ->where('sequence_number', '>', $currentSequence)
                ->delete();

            $nextSequence = $currentSequence + 1;
            $storagePath = "{$document->uuid}/working/steps/{$nextSequence}/result.pdf";
            Storage::disk('documents')->put($storagePath, file_get_contents($builtAbsolutePath));

            $step = DocumentEditOperation::create([
                'document_id' => $document->id,
                'sequence_number' => $nextSequence,
                'operation_type' => $operationType,
                'payload' => $payload,
                'resulting_storage_path' => $storagePath,
                'page_count_after' => $newPageCount,
                'pages_snapshot' => null,
                'created_by' => $user->id,
                'created_at' => now(),
            ]);

            if ($document->base_version_id === null) {
                $document->base_version_id = $this->baseVersion($document)->id;
            }
            $document->current_step_id = $step->id;
            $document->save();

            $job = DocumentJob::create([
                'document_id' => $document->id,
                'job_type' => 'working_thumbnail_generation',
                'status' => 'queued',
                'payload' => ['stepId' => $step->id],
                'created_by' => $user->id,
            ]);
            GenerateWorkingThumbnails::dispatch($step->id, $job->id);

            return ['step' => $step, 'job' => $job];
        });
    }

    /** Move the working-copy pointer back one step (or to the base version if there's only one step). */
    public function undo(Document $document): DocumentEditOperation|null
    {
        if ($document->current_step_id === null) {
            throw PageOperationException::nothingToUndo();
        }

        $current = $document->currentStep;
        $previous = DocumentEditOperation::where('document_id', $document->id)
            ->where('sequence_number', $current->sequence_number - 1)
            ->first();

        $document->current_step_id = $previous?->id;
        $document->save();

        return $previous;
    }

    /** Move the working-copy pointer forward one step, if a step ahead of the current one exists. */
    public function redo(Document $document): DocumentEditOperation
    {
        $currentSequence = $document->currentStep?->sequence_number ?? 0;

        $next = DocumentEditOperation::where('document_id', $document->id)
            ->where('sequence_number', $currentSequence + 1)
            ->first();

        if (! $next) {
            throw PageOperationException::nothingToRedo();
        }

        $document->current_step_id = $next->id;
        $document->save();

        return $next;
    }

    public function canUndo(Document $document): bool
    {
        return $document->current_step_id !== null;
    }

    public function canRedo(Document $document): bool
    {
        $currentSequence = $document->currentStep?->sequence_number ?? 0;

        return DocumentEditOperation::where('document_id', $document->id)
            ->where('sequence_number', $currentSequence + 1)
            ->exists();
    }

    /** A scratch working directory for building an operation's output before it's committed. */
    public function newScratchDir(): string
    {
        $relative = 'edit-scratch/'.Str::random(12);
        Storage::disk('temp')->makeDirectory($relative);

        return Storage::disk('temp')->path($relative);
    }

    public function cleanupScratchDir(string $absolutePath): void
    {
        // `path('')` already returns the disk root WITH a trailing slash —
        // appending another separator here previously produced a
        // double-slash needle that never matched, so Str::after() silently
        // returned the untouched absolute path and deleteDirectory() (which
        // expects a disk-relative path) was a silent no-op. Caught by
        // testing: after ~20 real operations, storage/app/private/temp/
        // edit-scratch/ still had ~18 orphaned directories instead of zero.
        $relative = Str::after($absolutePath, Storage::disk('temp')->path(''));
        Storage::disk('temp')->deleteDirectory($relative);
    }

    /**
     * Turn the current working state into a new, real, immutable
     * `document_versions` row — SAVE in the document lifecycle
     * (OPEN → VALIDATE → LOAD → RENDER → EDIT → SAVE → ...). The original
     * (version 1) and every prior version are untouched; only the
     * `is_current` flag moves. Resets the working-copy pointer so further
     * edits build on top of the version just created.
     */
    public function save(Document $document, User $user): DocumentVersion
    {
        if (! $this->canUndo($document)) {
            throw PageOperationException::nothingToSave();
        }

        $currentAbsolutePath = $this->currentAbsolutePath($document);
        $pageCount = $this->currentPageCount($document);

        return DB::transaction(function () use ($document, $user, $currentAbsolutePath, $pageCount) {
            $nextVersionNumber = (int) $document->versions()->max('version_number') + 1;
            $document->versions()->where('is_current', true)->update(['is_current' => false]);

            $checksum = hash_file('sha256', $currentAbsolutePath);
            $storagePath = "{$document->uuid}/versions/{$nextVersionNumber}/document.pdf";
            Storage::disk('documents')->put($storagePath, file_get_contents($currentAbsolutePath));

            $version = DocumentVersion::create([
                'document_id' => $document->id,
                'version_number' => $nextVersionNumber,
                'storage_disk' => 'documents',
                'storage_path' => $storagePath,
                'size_bytes' => filesize($currentAbsolutePath),
                'checksum_sha256' => $checksum,
                'created_by' => $user->id,
                'is_current' => true,
                'created_at' => now(),
            ]);

            $document->update([
                'base_version_id' => $version->id,
                'current_step_id' => null,
                'page_count' => $pageCount,
                'status' => 'processing',
            ]);

            AuditLogger::record('document.saved', $document, ['versionNumber' => $nextVersionNumber]);

            $job = DocumentJob::create([
                'document_id' => $document->id,
                'job_type' => 'thumbnail_generation',
                'status' => 'queued',
                'created_by' => $user->id,
            ]);
            GenerateDocumentThumbnails::dispatch($document->id, $version->id, $job->id);

            return $version;
        });
    }

    /**
     * SAVE AS: the current working state becomes version 1 of a brand new,
     * independent `Document` — further edits to either document never
     * affect the other.
     */
    public function saveAs(Document $document, User $user, string $title): Document
    {
        $newDocument = $this->createDocumentFromFile(
            $user,
            $this->currentAbsolutePath($document),
            $title,
            $document->original_filename,
        );

        AuditLogger::record('document.saved_as', $document, ['newDocumentUuid' => $newDocument->uuid]);

        return $newDocument;
    }

    /**
     * Shared by SAVE AS and the Editing operations that produce a brand
     * new document (Extract, Split): wraps an arbitrary already-built PDF
     * file as version 1 of a new `Document`, owned by $user, and queues
     * the normal Phase 2 thumbnail pipeline for it.
     */
    public function createDocumentFromFile(User $user, string $absolutePath, string $title, string $originalFilename): Document
    {
        return DB::transaction(function () use ($user, $absolutePath, $title, $originalFilename) {
            $newUuid = (string) Str::uuid();
            $checksum = hash_file('sha256', $absolutePath);
            $storagePath = "{$newUuid}/original/original.pdf";
            Storage::disk('documents')->put($storagePath, file_get_contents($absolutePath));

            $newDocument = Document::create([
                'uuid' => $newUuid,
                'user_id' => $user->id,
                'title' => $title,
                'original_filename' => $originalFilename,
                'mime_type' => 'application/pdf',
                'size_bytes' => filesize($absolutePath),
                'status' => 'processing',
            ]);

            $version = DocumentVersion::create([
                'document_id' => $newDocument->id,
                'version_number' => 1,
                'storage_disk' => 'documents',
                'storage_path' => $storagePath,
                'size_bytes' => filesize($absolutePath),
                'checksum_sha256' => $checksum,
                'created_by' => $user->id,
                'is_current' => true,
                'created_at' => now(),
            ]);

            $job = DocumentJob::create([
                'document_id' => $newDocument->id,
                'job_type' => 'thumbnail_generation',
                'status' => 'queued',
                'created_by' => $user->id,
            ]);
            GenerateDocumentThumbnails::dispatch($newDocument->id, $version->id, $job->id);

            return $newDocument->fresh();
        });
    }
}
