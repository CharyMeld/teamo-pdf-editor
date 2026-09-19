<?php

namespace App\Domain\Conversion\Services;

use App\Exceptions\ConversionException;
use Illuminate\Support\Facades\Process;
use ZipArchive;

/**
 * The Conversion module's first real logic (Phase 8): thin, safe wrappers
 * around the CLI engines chosen for each conversion direction — following
 * the exact `Process::timeout()->run()` convention `PdfPageEngine`/
 * `OcrEngine` already established (argument arrays, never a shell string;
 * explicit `->successful()` checks; verify output files via `is_file()`).
 *
 * FROM an existing PDF (`toText`/`toImages`/`toDocx`): all reuse
 * poppler-utils, already a core dependency of this app since Phase 2
 * (`pdftoppm`/`pdftotext`/`pdfinfo`).
 *
 * TO a new PDF (`officeToPdf`): `pandoc` (already installed) reading a
 * real `.docx`, rendered to PDF via `wkhtmltopdf` as pandoc's external
 * `--pdf-engine` (installed specifically for this phase — no
 * LibreOffice/`soffice`/`unoconv` exists on this host, and pandoc has no
 * PDF engine of its own). Verified empirically before being wired in here:
 * a real `.docx` -> pandoc -> wkhtmltopdf round trip produces a genuine,
 * `qpdf --check`-clean, `pdftotext`-extractable PDF.
 */
class ConversionEngine
{
    /** Real, extractable plain text — `-layout` preserves column/spacing structure better than the default. */
    public function toText(string $pdfPath, string $outTxtPath): void
    {
        $result = Process::timeout(120)->run(['pdftotext', '-layout', $pdfPath, $outTxtPath]);
        if (! $result->successful() || ! is_file($outTxtPath)) {
            throw ConversionException::processingFailed('could not extract text: '.trim($result->errorOutput()));
        }
    }

    /**
     * Rasterizes each requested page to its own image file — same
     * technique as `DocumentThumbnailRenderer::renderPage`/
     * `OcrEngine::renderPageForOcr`, parameterized by format/DPI instead
     * of fixed to thumbnail/OCR needs.
     *
     * @param  list<int>  $pages
     * @return list<string> absolute paths of the produced image files, in page order
     */
    public function toImages(string $pdfPath, array $pages, string $format, string $outDir, int $dpi): array
    {
        $flag = $format === 'jpeg' ? '-jpeg' : '-png';
        $produced = [];

        foreach ($pages as $page) {
            $outPrefix = $outDir.'/page-'.$page;
            $result = Process::timeout(60)->run([
                'pdftoppm', $flag, '-r', (string) $dpi, '-f', (string) $page, '-l', (string) $page, $pdfPath, $outPrefix,
            ]);
            if (! $result->successful()) {
                throw ConversionException::processingFailed("could not rasterize page {$page}: ".trim($result->errorOutput()));
            }

            $ext = $format === 'jpeg' ? 'jpg' : 'png';
            $matches = glob($outPrefix.'*.'.$ext);
            if ($matches === [] || $matches === false || ! is_file($matches[0])) {
                throw ConversionException::processingFailed("rasterizing page {$page} produced no output.");
            }
            $produced[] = $matches[0];
        }

        return $produced;
    }

    /** Bundles produced image files into one downloadable zip. */
    public function zipFiles(array $absolutePaths, string $outZipPath): void
    {
        $zip = new ZipArchive;
        if ($zip->open($outZipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            throw ConversionException::processingFailed('could not create the zip archive.');
        }
        foreach ($absolutePaths as $path) {
            $zip->addFile($path, basename($path));
        }
        $zip->close();

        if (! is_file($outZipPath)) {
            throw ConversionException::processingFailed('the zip archive was not created.');
        }
    }

    /**
     * Text/paragraph-level conversion, NOT pixel-perfect layout
     * preservation — `pdftohtml -i` (ignore images) produces per-run
     * absolutely-positioned `<p>` tags rather than a rasterized page
     * background, which lets pandoc read it as real flowing paragraph
     * text; tables/columns/images are not reconstructed. This limitation
     * is surfaced honestly in the frontend copy, not hidden.
     */
    public function toDocx(string $pdfPath, string $outDocxPath, string $scratchDir): void
    {
        $htmlBase = $scratchDir.'/out';
        $result = Process::timeout(60)->run(['pdftohtml', '-s', '-noframes', '-i', $pdfPath, $htmlBase]);
        if (! $result->successful() || ! is_file($htmlBase.'.html')) {
            throw ConversionException::processingFailed('could not extract document structure: '.trim($result->errorOutput()));
        }

        $result = Process::timeout(60)->run(['pandoc', $htmlBase.'.html', '-o', $outDocxPath]);
        if (! $result->successful() || ! is_file($outDocxPath)) {
            throw ConversionException::processingFailed('could not produce the Word document: '.trim($result->errorOutput()));
        }
    }

    /**
     * `wkhtmltopdf` can exit 0 while still having produced a broken/empty
     * PDF (a real, observed failure mode of headless-Qt-based renderers,
     * distinct from qpdf's well-defined exit codes) — the output is
     * verified with `pdfinfo` before this returns, not trusted from the
     * exit code alone.
     */
    public function officeToPdf(string $docxPath, string $outPdfPath): void
    {
        $result = Process::timeout(120)->run(['pandoc', $docxPath, '-o', $outPdfPath, '--pdf-engine=wkhtmltopdf']);
        if (! $result->successful() || ! is_file($outPdfPath)) {
            throw ConversionException::processingFailed('could not produce a PDF: '.trim($result->errorOutput()));
        }

        $probe = Process::timeout(30)->run(['pdfinfo', $outPdfPath]);
        if (! $probe->successful() || preg_match('/^Pages:\s+(\d+)/m', $probe->output()) !== 1) {
            throw ConversionException::processingFailed('the generated PDF is not valid.');
        }
    }
}
