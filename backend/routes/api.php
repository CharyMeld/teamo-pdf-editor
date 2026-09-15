<?php

use App\Http\Controllers\Api\DevAuthController;
use App\Http\Controllers\Api\DocumentController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::get('/health', function () {
    return response()->json([
        'status' => 'ok',
        'app' => config('app.name'),
        'time' => now()->toIso8601String(),
    ]);
});

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
});
