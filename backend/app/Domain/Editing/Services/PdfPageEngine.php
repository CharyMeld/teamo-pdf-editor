<?php

namespace App\Domain\Editing\Services;

use App\Exceptions\PageOperationException;
use Illuminate\Support\Facades\Process;

/**
 * The Editing module's first real logic (Phase 3): a thin, safe wrapper
 * around the two CLI engines chosen for page-level PDF manipulation — see
 * ARCHITECTURE.md's Phase 3 section for why.
 *
 *  - `qpdf` (page composition: insert/delete/reorder/duplicate/extract/
 *    split/merge/replace, plus rotate) via its `--pages` primitive: an
 *    output is built by listing, for each source file, which of its pages
 *    to take and in what order — a single mechanism that covers almost
 *    every structural operation ORGANIZE needs.
 *  - Ghostscript (`gs`) for crop only — qpdf has no CLI crop primitive;
 *    Ghostscript rewrites a page's MediaBox via `-dDEVICEWIDTHPOINTS`/
 *    `-dDEVICEHEIGHTPOINTS`/`-dFIXEDMEDIA` plus a PostScript `PageOffset`.
 *
 * Every invocation runs through Laravel's `Process` facade with an
 * argument array (never a shell string), so page numbers/paths — even
 * though they come from an authenticated, authorized request — can never
 * be interpreted as shell syntax.
 *
 * qpdf's exit code 3 means "succeeded with warnings" (e.g. minor
 * cross-reference quirks in the *source* PDF that don't affect the
 * result) — confirmed empirically against several real-world PDFs during
 * development, where treating 3 as a failure would incorrectly reject
 * perfectly good output. Only exit code 2 (real qpdf error) or a process
 * that couldn't run at all is treated as failure.
 */
class PdfPageEngine
{
    private const QPDF_SUCCESS = 0;

    private const QPDF_WARNINGS = 3;

    /**
     * Compose a new PDF from ordered page ranges of one or more source
     * files, optionally rotating specific *output* page positions.
     *
     * @param  list<array{path: string, range: string, password?: string}>  $sources
     * @param  array<int, int>  $rotations  outputPageNumber => degrees (already normalized to one of 90/180/270/-90 by the caller)
     */
    public function compose(string $outputPath, array $sources, array $rotations = []): void
    {
        if ($sources === []) {
            throw PageOperationException::processingFailed('no source pages given.');
        }

        $args = ['qpdf', '--empty', '--pages'];
        foreach ($sources as $source) {
            $args[] = $source['path'];
            if (! empty($source['password'])) {
                $args[] = '--password='.$source['password'];
            }
            $args[] = $source['range'];
        }
        $args[] = '--';

        foreach ($rotations as $pageNumber => $degrees) {
            $sign = $degrees < 0 ? '' : '+'; // qpdf wants an explicit +/- prefix; negative already carries its own '-'.
            $args[] = "--rotate={$sign}{$degrees}:{$pageNumber}";
        }

        $args[] = $outputPath;

        $this->run($args, 120);
    }

    /** Real page count of a (possibly password-protected) PDF, via qpdf itself. */
    public function pageCount(string $path, ?string $password = null): int
    {
        $args = ['qpdf'];
        if ($password) {
            $args[] = '--password='.$password;
        }
        $args[] = '--show-npages';
        $args[] = $path;

        $result = $this->run($args, 30);

        $count = (int) trim($result->output());
        if ($count < 1) {
            throw PageOperationException::processingFailed('resulting document has no pages.');
        }

        return $count;
    }

    /**
     * Crop one single-page PDF to a bottom-left-origin box (PDF points —
     * native PDF coordinate convention) via Ghostscript, producing a new
     * single-page PDF of exactly that size.
     */
    public function cropSinglePage(string $inputPath, string $outputPath, float $x, float $y, float $width, float $height): void
    {
        $args = [
            'gs', '-q', '-o', $outputPath,
            '-sDEVICE=pdfwrite',
            '-dUseCropBox',
            '-dDEVICEWIDTHPOINTS='.$this->fmt($width),
            '-dDEVICEHEIGHTPOINTS='.$this->fmt($height),
            '-dFIXEDMEDIA',
            '-c', '<</PageOffset ['.$this->fmt(-$x).' '.$this->fmt(-$y).']>> setpagedevice',
            '-f', $inputPath,
        ];

        $result = Process::timeout(60)->run($args);
        if (! $result->successful()) {
            throw PageOperationException::processingFailed('cropping failed: '.trim($result->errorOutput()));
        }

        if (! is_file($outputPath)) {
            throw PageOperationException::processingFailed('crop produced no output file.');
        }
    }

    /** A blank page sized to match an existing page, via Ghostscript. */
    public function blankPage(string $outputPath, float $widthPt, float $heightPt): void
    {
        $args = [
            'gs', '-q', '-o', $outputPath,
            '-sDEVICE=pdfwrite',
            '-dDEVICEWIDTHPOINTS='.$this->fmt($widthPt),
            '-dDEVICEHEIGHTPOINTS='.$this->fmt($heightPt),
            '-dFIXEDMEDIA',
            '-c', 'showpage',
        ];

        $result = Process::timeout(30)->run($args);
        if (! $result->successful() || ! is_file($outputPath)) {
            throw PageOperationException::processingFailed('could not generate a blank page.');
        }
    }

    /** @return \Illuminate\Contracts\Process\ProcessResult */
    private function run(array $args, int $timeoutSeconds)
    {
        $result = Process::timeout($timeoutSeconds)->run($args);
        $code = $result->exitCode();

        if (! in_array($code, [self::QPDF_SUCCESS, self::QPDF_WARNINGS], true)) {
            throw PageOperationException::processingFailed(trim($result->errorOutput()) ?: 'the process exited with code '.$code);
        }

        return $result;
    }

    private function fmt(float $n): string
    {
        // qpdf/gs accept plain decimal points; avoid scientific notation for tiny/large values.
        return rtrim(rtrim(number_format($n, 3, '.', ''), '0'), '.') ?: '0';
    }
}
