<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * LOCAL-DEVELOPMENT-ONLY auto-authentication. There is no login/register
 * UI yet (deferred by the user's own Phase 1 instruction) but
 * `documents.user_id` is a real foreign key, so Phase 2 needs *a* real,
 * persisted user to attach uploads to. This establishes a real Sanctum SPA
 * session for a single seeded dev user — it is not a mock auth layer, the
 * session it creates is exactly what a real login endpoint would create.
 *
 * Hard-gated to `app()->environment('local')`; a future phase replaces
 * this file entirely with real login/register endpoints and removes it.
 */
class DevAuthController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        abort_unless(app()->environment('local'), 404);

        $user = User::firstOrCreate(
            ['email' => 'dev@teamo.local'],
            [
                'name' => 'TeamO Dev User',
                'password' => Hash::make(Str::random(40)),
                'email_verified_at' => now(),
            ],
        );

        Auth::login($user);
        $request->session()->regenerate();

        return response()->json([
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
        ]);
    }
}
