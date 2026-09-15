<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

// This app is API-only — there is no web login page. Laravel's default
// Authenticate middleware still resolves a `route('login')` name to build
// the (unused) redirect target on an AuthenticationException before our
// custom JSON exception renderer (bootstrap/app.php) ever sees it; without
// a route named "login", that resolution itself throws a RouteNotFoundException
// that masks the real 401. This stub exists only so that resolution succeeds;
// nothing ever navigates here in practice (the SPA never gets redirected,
// since api/* requests always render the real 401 JSON body instead).
Route::get('/login', function () {
    return response()->json(['error' => ['message' => 'Unauthenticated.', 'code' => 401]], 401);
})->name('login');
