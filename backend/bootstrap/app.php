<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        $middleware->statefulApi();
    })
    ->withExceptions(function (Exceptions $exceptions) {
        $exceptions->shouldRenderJsonWhen(function ($request, \Throwable $e) {
            return $request->is('api/*') || $request->expectsJson();
        });

        $exceptions->render(function (\Throwable $e, $request) {
            if ($request->is('api/*') || $request->expectsJson()) {
                $status = match (true) {
                    $e instanceof \App\Exceptions\DomainException => $e->statusCode(),
                    method_exists($e, 'getStatusCode') => $e->getStatusCode(),
                    default => 500,
                };

                return response()->json([
                    'error' => [
                        'message' => app()->isProduction() && $status === 500
                            ? 'Internal server error.'
                            : $e->getMessage(),
                        'code' => $status,
                    ],
                ], $status);
            }
        });
    })->create();
