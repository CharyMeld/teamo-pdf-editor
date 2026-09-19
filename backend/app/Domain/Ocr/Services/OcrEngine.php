<?php

namespace App\Domain\Ocr\Services;

use App\Exceptions\OcrException;
use Illuminate\Support\Facades\Process;

/**
 * The Ocr module's first real logic (Phase 7): a thin, safe wrapper around
 * the CLI engines chosen for text recognition — Tesseract 5.3.4 (confirmed
 * installed on this host) for OCR itself, poppler-utils' `pdftotext`/
 * `pdftoppm` (already used by DocumentThumbnailRenderer) for "does this
 * page already have real text" and "rasterize this page for OCR".
 *
 * Every invocation runs through Laravel's `Process` facade with an
 * argument array (never a shell string), following the exact convention
 * `PdfPageEngine`/`DocumentThumbnailRenderer` already established.
 */
class OcrEngine
{
    private const HAS_TEXT_MIN_LENGTH = 10;

    /**
     * Real installed Tesseract language codes, filtering out `osd`
     * (orientation/script detection data — not a selectable OCR
     * language). Reported honestly: only what's actually on this box,
     * same principle as Phase 4's `AVAILABLE_FONTS`.
     *
     * @return list<string>
     */
    public function installedLanguages(): array
    {
        $result = Process::timeout(10)->run(['tesseract', '--list-langs']);
        if (! $result->successful()) {
            throw OcrException::processingFailed('could not list installed languages: '.trim($result->errorOutput()));
        }

        $lines = preg_split('/\r?\n/', trim($result->output())) ?: [];
        // First line is "List of available languages ...", not a language.
        $languages = array_slice($lines, 1);

        return array_values(array_filter($languages, fn (string $lang) => trim($lang) !== '' && $lang !== 'osd'));
    }

    public function assertLanguageInstalled(string $language): void
    {
        if (! in_array($language, $this->installedLanguages(), true)) {
            throw OcrException::unsupportedLanguage($language);
        }
    }

    /**
     * Whether the given page of the PDF already contains real, extractable
     * text — a page like this is left completely untouched by OcrService,
     * never rasterized/re-OCR'd, so mixed scanned/text documents behave
     * correctly.
     */
    public function hasExistingText(string $pdfPath, int $page): bool
    {
        $result = Process::timeout(30)->run([
            'pdftotext', '-f', (string) $page, '-l', (string) $page, $pdfPath, '-',
        ]);

        if (! $result->successful()) {
            // A page pdftotext can't read is not "already has text" — let
            // OCR attempt it rather than silently skipping.
            return false;
        }

        return mb_strlen(trim($result->output())) > self::HAS_TEXT_MIN_LENGTH;
    }

    /**
     * Rasterize one page to a high-DPI PNG for OCR — same technique as
     * `DocumentThumbnailRenderer::renderPage`, higher DPI for recognition
     * accuracy rather than UI display size.
     *
     * @return string absolute path to the rendered PNG
     */
    public function renderPageForOcr(string $pdfPath, int $page, string $outPrefix): string
    {
        $dpi = (int) config('documents.ocr_dpi', 300);

        $result = Process::timeout(60)->run([
            'pdftoppm', '-png', '-r', (string) $dpi, '-f', (string) $page, '-l', (string) $page, $pdfPath, $outPrefix,
        ]);

        if (! $result->successful()) {
            throw OcrException::processingFailed("could not rasterize page {$page}: ".trim($result->errorOutput()));
        }

        $produced = glob($outPrefix.'*.png');
        if ($produced === [] || $produced === false || ! is_file($produced[0])) {
            throw OcrException::processingFailed("rasterizing page {$page} produced no output.");
        }

        return $produced[0];
    }

    /**
     * Run Tesseract against a rasterized page image, producing both a
     * single-page searchable PDF (real positioned text, not raster-only —
     * verified empirically against a real test page before this was wired
     * into the splice pipeline) and the plain-text transcript.
     *
     * @return array{pdfPath: string, text: string}
     */
    public function runTesseract(string $imagePath, string $outBase, string $language): array
    {
        $result = Process::timeout(120)->run([
            'tesseract', $imagePath, $outBase, '-l', $language, 'pdf', 'txt',
        ]);

        if (! $result->successful()) {
            throw OcrException::processingFailed('tesseract failed: '.trim($result->errorOutput()));
        }

        $pdfPath = $outBase.'.pdf';
        $txtPath = $outBase.'.txt';
        if (! is_file($pdfPath) || ! is_file($txtPath)) {
            throw OcrException::processingFailed('tesseract did not produce the expected output files.');
        }

        return ['pdfPath' => $pdfPath, 'text' => file_get_contents($txtPath)];
    }
}
