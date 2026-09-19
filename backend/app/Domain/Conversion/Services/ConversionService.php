<?php

namespace App\Domain\Conversion\Services;

use App\Domain\Editing\Services\WorkingCopyManager;
use App\Exceptions\ConversionException;
use App\Models\Document;
use App\Models\DocumentJob;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Phase 8 (document conversion) — FROM an existing PDF: orchestrates
 * `ConversionEngine`'s primitives against the document's CURRENT working
 * state (`WorkingCopyManager::currentAbsolutePath()` — same source Phase
 * 7's OCR reads from, so a conversion reflects any pending unsaved edits,
 * not just the last Save). Unlike OCR, the result is never spliced back
 * into the working copy — it's a standalone downloadable file, since none
 * of `.txt`/`.zip`/`.docx` are PDFs the app's Document model can represent.
 */
class ConversionService
{
    public function __construct(
        private readonly ConversionEngine $engine,
        private readonly WorkingCopyManager $working,
    ) {}

    /**
     * @param  list<int>  $pages  only meaningful for format 'images'
     * @return array{outputPath: string, downloadFilename: string, mimeType: string, sizeBytes: int}
     */
    public function run(Document $document, string $format, array $pages, string $imageFormat, DocumentJob $job): array
    {
        $job->update(['status' => 'processing', 'started_at' => now()]);

        $sourcePath = $this->working->currentAbsolutePath($document);
        $scratch = $this->working->newScratchDir();

        try {
            $result = match ($format) {
                'txt' => $this->runToText($document, $sourcePath, $scratch, $job),
                'images' => $this->runToImages($document, $sourcePath, $scratch, $pages, $imageFormat, $job),
                'docx' => $this->runToDocx($document, $sourcePath, $scratch, $job),
                default => throw ConversionException::unsupportedFormat($format),
            };

            $job->update([
                'status' => 'completed',
                'progress_percent' => 100,
                'completed_at' => now(),
                'payload' => $result,
            ]);

            return $result;
        } finally {
            $this->working->cleanupScratchDir($scratch);
        }
    }

    /** @return list<int> validated, de-duplicated, ascending */
    public function normalizePages(array $pages, int $pageCount): array
    {
        if ($pages === []) {
            throw ConversionException::emptyPageSelection();
        }

        $pages = array_map('intval', $pages);
        $invalid = array_values(array_filter($pages, fn (int $p) => $p < 1 || $p > $pageCount));
        if ($invalid !== []) {
            throw ConversionException::invalidPageNumbers($invalid, $pageCount);
        }

        $pages = array_values(array_unique($pages));
        sort($pages);

        return $pages;
    }

    private function runToText(Document $document, string $sourcePath, string $scratch, DocumentJob $job): array
    {
        $job->update(['progress_percent' => 50]);

        $scratchTxt = $scratch.'/output.txt';
        $this->engine->toText($sourcePath, $scratchTxt);

        return $this->store($document, $job, $scratchTxt, 'txt', 'text/plain');
    }

    /** @param  list<int>  $pages */
    private function runToImages(Document $document, string $sourcePath, string $scratch, array $pages, string $imageFormat, DocumentJob $job): array
    {
        $total = count($pages);
        $produced = [];
        foreach ($pages as $i => $page) {
            $produced = array_merge($produced, $this->engine->toImages($sourcePath, [$page], $imageFormat, $scratch, (int) config('documents.conversion_image_dpi', 150)));
            $job->update(['progress_percent' => (int) floor(($i + 1) / $total * 90)]);
        }

        $scratchZip = $scratch.'/output.zip';
        $this->engine->zipFiles($produced, $scratchZip);

        return $this->store($document, $job, $scratchZip, 'zip', 'application/zip');
    }

    private function runToDocx(Document $document, string $sourcePath, string $scratch, DocumentJob $job): array
    {
        $job->update(['progress_percent' => 50]);

        $scratchDocx = $scratch.'/output.docx';
        $this->engine->toDocx($sourcePath, $scratchDocx, $scratch);

        return $this->store($document, $job, $scratchDocx, 'docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    }

    /** @return array{outputPath: string, downloadFilename: string, mimeType: string, sizeBytes: int} */
    private function store(Document $document, DocumentJob $job, string $scratchAbsolutePath, string $extension, string $mimeType): array
    {
        $storagePath = "{$document->uuid}/conversions/{$job->id}/output.{$extension}";
        Storage::disk('documents')->put($storagePath, file_get_contents($scratchAbsolutePath));

        $baseName = Str::slug($document->title) ?: 'document';
        $suffix = $extension === 'zip' ? '-pages' : '';

        return [
            'outputPath' => $storagePath,
            'downloadFilename' => "{$baseName}{$suffix}.{$extension}",
            'mimeType' => $mimeType,
            'sizeBytes' => filesize($scratchAbsolutePath),
        ];
    }
}
