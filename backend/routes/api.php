<?php

use App\Http\Controllers\Api\AiSettingsController;
use App\Http\Controllers\Api\CompressionController;
use App\Http\Controllers\Api\ConversionController;
use App\Http\Controllers\Api\DevAuthController;
use App\Http\Controllers\Api\DocumentAnnotationController;
use App\Http\Controllers\Api\DocumentContentController;
use App\Http\Controllers\Api\DocumentController;
use App\Http\Controllers\Api\DocumentEditController;
use App\Http\Controllers\Api\DocumentFormController;
use App\Http\Controllers\Api\OcrController;
use App\Http\Controllers\Api\OfficeConversionController;
use App\Http\Controllers\Api\ScanSessionController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Laravel\Sanctum\Http\Middleware\EnsureFrontendRequestsAreStateful;

// `statefulApi()` (bootstrap/app.php) applies Sanctum's stateful-request
// middleware to every route in this file, which starts/touches a session
// on every hit — correct for the auth-gated routes below, but wrong for a
// pure health check with no session/auth concern of its own. Left as-is,
// this endpoint raced the app boot's own devSessionReady bootstrap
// (checkHealth() in StatusBar fires independently, immediately, uninvolved
// in devSessionReady): when its own session-starting request landed
// between the CSRF-cookie fetch and /dev/login, the browser could end up
// holding a session cookie from a DIFFERENT server-side session than the
// one its XSRF token belonged to, producing an intermittent real
// "CSRF token mismatch" / "Unauthenticated" failure on the very next
// authenticated request — reproduced and confirmed during Phase 3 UI
// testing, not a test-harness artifact. Excluding this one route from the
// stateful middleware removes the race at its root instead of papering
// over it with client-side sequencing.
Route::get('/health', function () {
    return response()->json([
        'status' => 'ok',
        'app' => config('app.name'),
        'time' => now()->toIso8601String(),
    ]);
})->withoutMiddleware(EnsureFrontendRequestsAreStateful::class);

// Local-development-only auto-auth shortcut — see ARCHITECTURE.md's Phase 2
// section and DevAuthController's docblock. 404s outside app()->environment('local').
Route::post('/dev/login', [DevAuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/user', function (Request $request) {
        return $request->user();
    });

    Route::get('/documents', [DocumentController::class, 'index']);
    Route::post('/documents', [DocumentController::class, 'store']);
    Route::get('/documents/{document}', [DocumentController::class, 'show']);
    Route::get('/documents/{document}/status', [DocumentController::class, 'status']);
    Route::get('/documents/{document}/pages', [DocumentController::class, 'pages']);
    Route::get('/documents/{document}/file', [DocumentController::class, 'file']);
    Route::get('/documents/{document}/pages/{pageNumber}/thumbnail', [DocumentController::class, 'thumbnail']);
    Route::post('/documents/{document}/unlock', [DocumentController::class, 'unlock']);

    // Phase 13 (document management): rename/delete/duplicate/download,
    // archive/unarchive, and version/processing history — all real
    // reads/writes over data every prior phase already produces (see
    // DocumentController's new methods' docblocks). No new schema.
    Route::patch('/documents/{document}', [DocumentController::class, 'update']);
    Route::delete('/documents/{document}', [DocumentController::class, 'destroy']);
    Route::post('/documents/{document}/duplicate', [DocumentController::class, 'duplicate']);
    Route::get('/documents/{document}/download', [DocumentController::class, 'download']);
    Route::post('/documents/{document}/archive', [DocumentController::class, 'archive']);
    Route::post('/documents/{document}/unarchive', [DocumentController::class, 'unarchive']);
    Route::get('/documents/{document}/versions', [DocumentController::class, 'versions']);
    Route::get('/documents/{document}/history', [DocumentController::class, 'history']);

    // Phase 3 (ORGANIZE): real page-management operations against the
    // document's working copy — see WorkingCopyManager's docblock and
    // ARCHITECTURE.md's Phase 3 section.
    Route::get('/documents/{document}/working/file', [DocumentEditController::class, 'workingFile']);
    Route::get('/documents/{document}/working/pages', [DocumentEditController::class, 'workingPages']);
    Route::get('/documents/{document}/working/pages/{pageNumber}/thumbnail', [DocumentEditController::class, 'workingThumbnail']);
    Route::post('/documents/{document}/operations/insert', [DocumentEditController::class, 'insert']);
    Route::post('/documents/{document}/operations/delete', [DocumentEditController::class, 'delete']);
    Route::post('/documents/{document}/operations/reorder', [DocumentEditController::class, 'reorder']);
    Route::post('/documents/{document}/operations/duplicate', [DocumentEditController::class, 'duplicate']);
    Route::post('/documents/{document}/operations/rotate', [DocumentEditController::class, 'rotate']);
    Route::post('/documents/{document}/operations/extract', [DocumentEditController::class, 'extract']);
    Route::post('/documents/{document}/operations/split', [DocumentEditController::class, 'split']);
    Route::post('/documents/{document}/operations/merge', [DocumentEditController::class, 'merge']);
    Route::post('/documents/{document}/operations/replace', [DocumentEditController::class, 'replace']);
    Route::post('/documents/{document}/operations/crop', [DocumentEditController::class, 'crop']);
    Route::post('/documents/{document}/undo', [DocumentEditController::class, 'undo']);
    Route::post('/documents/{document}/redo', [DocumentEditController::class, 'redo']);
    Route::post('/documents/{document}/save', [DocumentEditController::class, 'save']);
    Route::post('/documents/{document}/save-as', [DocumentEditController::class, 'saveAs']);

    // Phase 4 (real PDF content editing — TEXT/IMAGE/OBJECT): content
    // objects (added text, overlay text edits, inserted images) drawn onto
    // the working copy — see ContentObjectService's docblock and
    // ARCHITECTURE.md's Phase 4 section.
    Route::get('/documents/{document}/content/objects', [DocumentContentController::class, 'index']);
    Route::post('/documents/{document}/content/objects', [DocumentContentController::class, 'store']);
    Route::patch('/documents/{document}/content/objects/{objectId}', [DocumentContentController::class, 'update']);
    Route::delete('/documents/{document}/content/objects/{objectId}', [DocumentContentController::class, 'destroy']);
    Route::post('/documents/{document}/content/objects/{objectId}/duplicate', [DocumentContentController::class, 'duplicate']);

    // Phase 5 (real PDF annotation engine — ANNOTATE): highlight/underline/
    // strikethrough/freehand/rectangle/circle/arrow/text-box/sticky-note/
    // stamp annotations drawn onto the working copy, via a parallel,
    // independent chain from Phase 4's content objects — see
    // AnnotationService's docblock and ARCHITECTURE.md's Phase 5 section.
    Route::get('/documents/{document}/annotations', [DocumentAnnotationController::class, 'index']);
    Route::post('/documents/{document}/annotations', [DocumentAnnotationController::class, 'store']);
    Route::patch('/documents/{document}/annotations/{annotationId}', [DocumentAnnotationController::class, 'update']);
    Route::delete('/documents/{document}/annotations/{annotationId}', [DocumentAnnotationController::class, 'destroy']);
    Route::post('/documents/{document}/annotations/{annotationId}/duplicate', [DocumentAnnotationController::class, 'duplicate']);

    // Phase 10 (PDF forms): design (create/move/resize/edit properties/
    // duplicate/delete) is a real, independent `form_*` working-copy
    // chain — a sibling to Phase 4's content objects and Phase 5's
    // annotations, not a modification of either — see FormFieldService's
    // docblock. fill/clear are separate, simpler operations against real
    // AcroForm field values via pdftk — see FormFillService's docblock.
    Route::get('/documents/{document}/form/fields', [DocumentFormController::class, 'index']);
    Route::post('/documents/{document}/form/fields', [DocumentFormController::class, 'store']);
    Route::patch('/documents/{document}/form/fields/{fieldId}', [DocumentFormController::class, 'update']);
    Route::delete('/documents/{document}/form/fields/{fieldId}', [DocumentFormController::class, 'destroy']);
    Route::post('/documents/{document}/form/fields/{fieldId}/duplicate', [DocumentFormController::class, 'duplicate']);
    Route::post('/documents/{document}/form/fill', [DocumentFormController::class, 'fillForm']);
    Route::post('/documents/{document}/form/clear', [DocumentFormController::class, 'clearForm']);

    // Phase 6 (scanning/image-import — SCAN/IMPORT -> REVIEW -> CLEAN ->
    // REORDER -> CREATE PDF): a scan session exists independently of any
    // Document until create-pdf hands a finished file to
    // WorkingCopyManager::createDocumentFromFile() — see
    // ScanSessionService/ImagesToPdfService's docblocks and
    // ARCHITECTURE.md's Phase 6 section.
    Route::post('/scan-sessions', [ScanSessionController::class, 'store']);
    Route::get('/scan-sessions/{session}', [ScanSessionController::class, 'show']);
    Route::post('/scan-sessions/{session}/images', [ScanSessionController::class, 'addImages']);
    Route::patch('/scan-sessions/{session}/images/{imageId}', [ScanSessionController::class, 'updateImage']);
    Route::post('/scan-sessions/{session}/reorder', [ScanSessionController::class, 'reorder']);
    Route::delete('/scan-sessions/{session}/images/{imageId}', [ScanSessionController::class, 'destroyImage']);
    Route::get('/scan-sessions/{session}/images/{imageId}/preview', [ScanSessionController::class, 'preview']);
    Route::post('/scan-sessions/{session}/create-pdf', [ScanSessionController::class, 'createPdf']);

    // Phase 7 (OCR / searchable documents): recognizes text on scanned
    // pages and splices it in as real, extractable page content via the
    // same working-copy step mechanism as ORGANIZE — see OcrService's
    // docblock and ARCHITECTURE.md's Phase 7 section. Runs as a queued
    // job (RunOcr); the frontend polls jobs.show for progress/result.
    Route::get('/documents/{document}/ocr/languages', [OcrController::class, 'languages']);
    Route::post('/documents/{document}/ocr', [OcrController::class, 'store']);
    Route::get('/documents/{document}/ocr/jobs/{job}', [OcrController::class, 'show']);
    Route::post('/documents/{document}/ocr/jobs/{job}/cancel', [OcrController::class, 'cancel']);

    // Phase 8 (document conversion): FROM an existing PDF (PDF -> TXT /
    // Images / Word) is a queued job polled exactly like Phase 7's OCR —
    // see ConversionService's docblock for why the result is a standalone
    // downloadable file rather than a working-copy mutation. TO a new PDF
    // (a real .docx Word document -> PDF) creates a brand-new Document,
    // same shape as Phase 6's Images -> PDF — see OfficeToPdfService's
    // docblock for why that one runs synchronously.
    Route::post('/documents/{document}/conversions', [ConversionController::class, 'store']);
    Route::get('/documents/{document}/conversions/jobs/{job}', [ConversionController::class, 'show']);
    Route::get('/documents/{document}/conversions/jobs/{job}/download', [ConversionController::class, 'download']);
    Route::post('/office-conversions', [OfficeConversionController::class, 'store']);

    // Phase 9 (PDF and file compression): real compression against a
    // document's current working state, queued and polled exactly like
    // Phase 8's conversions — see CompressionService's docblock for why
    // the default result is a standalone downloadable file, and why
    // "replace" is a normal, undoable working-copy step rather than an
    // immediate overwrite.
    Route::post('/documents/{document}/compressions', [CompressionController::class, 'store']);
    Route::get('/documents/{document}/compressions/jobs/{job}', [CompressionController::class, 'show']);
    Route::get('/documents/{document}/compressions/jobs/{job}/download', [CompressionController::class, 'download']);
    Route::post('/documents/{document}/compressions/jobs/{job}/replace', [CompressionController::class, 'replace']);

    // Phase 12.3 (AI provider settings): enable/disable AI, enable/
    // disable external processing, default provider, and per-provider
    // credential storage/testing — see AiSettingsController's docblock.
    // Not document-scoped (no {document} param) since these are
    // account-level settings, unlike every route above. No provider
    // adapter exists yet (Phase 12.4+), so testConnection here always
    // honestly reports PROVIDER_UNAVAILABLE.
    Route::get('/ai/settings', [AiSettingsController::class, 'show']);
    Route::patch('/ai/settings', [AiSettingsController::class, 'update']);
    Route::put('/ai/settings/providers/{provider}/credentials', [AiSettingsController::class, 'storeCredential']);
    Route::delete('/ai/settings/providers/{provider}/credentials', [AiSettingsController::class, 'destroyCredential']);
    Route::post('/ai/settings/providers/{provider}/test', [AiSettingsController::class, 'testConnection']);
});
