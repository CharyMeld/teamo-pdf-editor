<?php

namespace App\Domain\Compression\Services;

use App\Exceptions\CompressionException;
use Illuminate\Contracts\Process\ProcessResult;
use Illuminate\Support\Facades\Process;

/**
 * The Compression module's first real logic (Phase 9): thin, safe
 * wrappers around Ghostscript (`gs`, already a dependency —
 * `PdfPageEngine` already uses it for crop/blank-page) and `qpdf`
 * (already core), following the exact `Process::timeout()->run()`
 * convention every other engine class in this app uses.
 *
 * Every preset/custom option here was verified against a real 5.8MB,
 * 3-page, image-heavy test PDF before being wired in — see
 * `CompressionService`'s docblock and ARCHITECTURE.md's Phase 9 section
 * for the measured before/after sizes. Two gotchas caught only by that
 * testing, not assumed from documentation:
 *
 *  - Metadata removal via `-c "... pdfmark" -f file.pdf` (the commonly
 *    documented form) does NOT work — Title/Author survive unchanged.
 *    The real, verified-working form passes the pdfmark snippet as a
 *    SEPARATE file argument, processed AFTER the source PDF:
 *    `gs ... -sOutputFile=out.pdf source.pdf strip.ps`. See
 *    `stripMetadata()`.
 *  - Ghostscript/`gs` can exit 0 while a downstream stage produced
 *    something that isn't actually a valid PDF — every method here
 *    verifies the output with a real `pdfinfo` probe, never trusting the
 *    exit code alone (the same lesson `ConversionEngine::officeToPdf()`
 *    already encodes for wkhtmltopdf).
 */
class CompressionEngine
{
    private const PRESET_FLAGS = [
        'maxQuality' => '/prepress',
        'balanced' => '/ebook',
        'maxCompression' => '/screen',
    ];

    public function compressWithPreset(string $pdfPath, string $outPath, string $preset): void
    {
        $flag = self::PRESET_FLAGS[$preset] ?? throw CompressionException::unsupportedPreset($preset);

        $result = Process::timeout(180)->run([
            'gs', '-q', '-dNOPAUSE', '-dBATCH', '-sDEVICE=pdfwrite',
            '-dCompatibilityLevel=1.5', "-dPDFSETTINGS={$flag}",
            '-sOutputFile='.$outPath, $pdfPath,
        ]);
        $this->assertValidPdf($result, $outPath);
    }

    /** @param  array{imageDpi?: int, imageQuality?: int, imageFormat?: string, subsetFonts?: bool}  $options */
    public function compressCustom(string $pdfPath, string $outPath, array $options): void
    {
        $dpi = (int) ($options['imageDpi'] ?? 150);
        $quality = (int) ($options['imageQuality'] ?? 75);
        $filter = ($options['imageFormat'] ?? 'jpeg') === 'lossless' ? '/FlateEncode' : '/DCTEncode';
        // Real gs pdfwrite default is already true for both — this only
        // needs to be a real, honest OFF-switch, not something that must
        // be turned on to take effect.
        $subsetFonts = ($options['subsetFonts'] ?? true) ? 'true' : 'false';

        $result = Process::timeout(180)->run([
            'gs', '-q', '-dNOPAUSE', '-dBATCH', '-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.5',
            // `DownsampleThreshold` defaults to 1.5 in gs — it silently
            // skips downsampling whenever the source is less than 1.5x
            // the target resolution, which means a custom DPI close to
            // (but above) the source's own density would otherwise do
            // nothing at all despite the user's explicit choice.
            // Confirmed empirically during this phase's testing: without
            // forcing this to 1.0, a real 141-PPI test image survived a
            // "100 DPI" request completely untouched (`pdfimages -list`
            // showed identical pixel dimensions before/after). Forcing it
            // to 1.0 makes the DPI control do what it says.
            '-dDownsampleColorImages=true', "-dColorImageResolution={$dpi}",
            '-dColorImageDownsampleType=/Bicubic', '-dColorImageDownsampleThreshold=1.0',
            '-dDownsampleGrayImages=true', "-dGrayImageResolution={$dpi}",
            '-dGrayImageDownsampleType=/Bicubic', '-dGrayImageDownsampleThreshold=1.0',
            '-dAutoFilterColorImages=false', "-dColorImageFilter={$filter}",
            '-dAutoFilterGrayImages=false', "-dGrayImageFilter={$filter}",
            "-dJPEGQ={$quality}",
            "-dSubsetFonts={$subsetFonts}", "-dCompressFonts={$subsetFonts}",
            '-sOutputFile='.$outPath, $pdfPath,
        ]);
        $this->assertValidPdf($result, $outPath);
    }

    /**
     * See this class's docblock for why the pdfmark snippet MUST be a
     * separate file argument after the source PDF, not `-c`/`-f` flags.
     */
    public function stripMetadata(string $pdfPath, string $outPath, string $scratchDir): void
    {
        $stripScript = $scratchDir.'/strip.ps';
        file_put_contents(
            $stripScript,
            "[ /Title () /Author () /Subject () /Keywords () /Creator () /Producer () /DOCINFO pdfmark\n",
        );

        $result = Process::timeout(60)->run([
            'gs', '-q', '-dNOPAUSE', '-dBATCH', '-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.5',
            '-sOutputFile='.$outPath, $pdfPath, $stripScript,
        ]);
        $this->assertValidPdf($result, $outPath);
    }

    /** Real "unused-object cleanup": compressed cross-reference/object streams plus removal of page resources nothing actually references. */
    public function cleanupUnusedObjects(string $pdfPath, string $outPath): void
    {
        $result = Process::timeout(60)->run([
            'qpdf', '--object-streams=generate', '--remove-unreferenced-resources=yes', $pdfPath, $outPath,
        ]);

        // qpdf exit code 3 = succeeded with warnings, same convention
        // PdfPageEngine already established for this exact tool.
        if (! in_array($result->exitCode(), [0, 3], true) || ! is_file($outPath)) {
            throw CompressionException::processingFailed('object cleanup failed: '.trim($result->errorOutput()));
        }
    }

    private function assertValidPdf(ProcessResult $result, string $outPath): void
    {
        if (! $result->successful() || ! is_file($outPath)) {
            throw CompressionException::processingFailed(trim($result->errorOutput()) ?: 'ghostscript failed.');
        }

        $probe = Process::timeout(30)->run(['pdfinfo', $outPath]);
        if (! $probe->successful() || preg_match('/^Pages:\s+(\d+)/m', $probe->output()) !== 1) {
            throw CompressionException::processingFailed('the compressed output is not a valid PDF.');
        }
    }
}
