<?php

namespace App\Domain\Audit\Services;

use App\Models\AuditLog;
use App\Models\Document;
use Illuminate\Http\Request;

/**
 * The single write path every module uses to record an audit_logs row —
 * see ARCHITECTURE.md's Audit module boundary ("no module writes audit
 * rows ad hoc"). First real caller is Phase 2's DocumentController.
 */
class AuditLogger
{
    public static function record(string $action, ?Document $document = null, array $context = [], ?Request $request = null): AuditLog
    {
        $request ??= request();

        return AuditLog::create([
            'user_id' => $request?->user()?->id,
            'document_id' => $document?->id,
            'action' => $action,
            'context' => $context,
            'ip_address' => $request?->ip(),
            'created_at' => now(),
        ]);
    }
}
