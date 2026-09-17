<?php

namespace App\Http\Controllers\Api\Concerns;

use App\Exceptions\PageOperationException;
use App\Models\Document;
use Illuminate\Http\Request;

/**
 * Shared by every controller that mutates a document's working copy
 * (`DocumentContentController` (Phase 4), `DocumentAnnotationController`
 * (Phase 5)) — extracted verbatim from `DocumentContentController` once a
 * second controller needed the exact same two checks, rather than a
 * speculative extraction ahead of a real second use.
 */
trait AuthorizesDocumentAccess
{
    private function authorizeOwner(Request $request, Document $document): void
    {
        abort_if($document->user_id !== $request->user()->id, 403);
    }

    /** Same "must be a rendered, ready document" gate every working-copy mutation uses. */
    private function authorizeEditable(Request $request, Document $document): void
    {
        $this->authorizeOwner($request, $document);
        if ($document->status !== 'ready') {
            throw PageOperationException::documentNotReady();
        }
    }
}
