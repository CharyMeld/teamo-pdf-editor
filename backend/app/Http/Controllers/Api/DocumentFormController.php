<?php

namespace App\Http\Controllers\Api;

use App\Domain\Forms\Services\FormFieldEngine;
use App\Domain\Forms\Services\FormFieldService;
use App\Exceptions\FormException;
use App\Http\Controllers\Api\Concerns\AuthorizesDocumentAccess;
use App\Http\Controllers\Controller;
use App\Models\Document;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Phase 10 (PDF forms): every endpoint here operates on the working-copy
 * `form_field_*` chain exactly like Phase 4/5's content/annotation
 * controllers — see `FormFieldService`'s docblock, including
 * `fillValues()`'s for why fill/save/clear are just another mutation of
 * that same chain rather than a separate mechanism. `index` returns each
 * field's design metadata directly — a field's own `params`
 * (`defaultValue`/`defaultChecked`/`defaultSelected`) already IS its real
 * current value (see `FormFieldService::fillValues()`'s docblock), so
 * there's no second "live values" read or store to merge in.
 */
class DocumentFormController extends Controller
{
    use AuthorizesDocumentAccess;

    public function __construct(private readonly FormFieldService $fields) {}

    public function index(Request $request, Document $document): JsonResponse
    {
        $this->authorizeOwner($request, $document);
        $page = $request->integer('page') ?: null;

        return response()->json(['data' => $this->fields->listActiveFields($document, $page)]);
    }

    public function store(Request $request, Document $document): JsonResponse
    {
        $this->authorizeEditable($request, $document);
        $data = $this->validateFieldPayload($request);

        return response()->json($this->fields->addField($document, $request->user(), $data), 201);
    }

    public function update(Request $request, Document $document, string $fieldId): JsonResponse
    {
        $this->authorizeEditable($request, $document);
        $data = $request->validate([
            'x' => ['sometimes', 'numeric'],
            'y' => ['sometimes', 'numeric'],
            'width' => ['sometimes', 'numeric', 'gt:0'],
            'height' => ['sometimes', 'numeric', 'gt:0'],
            'rotation' => ['sometimes', 'numeric'],
            'params' => ['sometimes', 'array'],
        ]);

        return response()->json($this->fields->updateField($document, $request->user(), $fieldId, $data));
    }

    public function destroy(Request $request, Document $document, string $fieldId): JsonResponse
    {
        $this->authorizeEditable($request, $document);

        return response()->json($this->fields->deleteField($document, $request->user(), $fieldId));
    }

    public function duplicate(Request $request, Document $document, string $fieldId): JsonResponse
    {
        $this->authorizeEditable($request, $document);

        return response()->json($this->fields->duplicateField($document, $request->user(), $fieldId));
    }

    public function fillForm(Request $request, Document $document): JsonResponse
    {
        $this->authorizeEditable($request, $document);
        $data = $request->validate(['values' => ['required', 'array', 'min:1']]);

        return response()->json($this->fields->fillValues($document, $request->user(), $data['values']));
    }

    public function clearForm(Request $request, Document $document): JsonResponse
    {
        $this->authorizeEditable($request, $document);
        $data = $request->validate(['fieldKeys' => ['sometimes', 'array'], 'fieldKeys.*' => ['string']]);

        return response()->json($this->fields->clearValues($document, $request->user(), $data['fieldKeys'] ?? null));
    }

    /** Shared validation for POST .../form/fields — shape depends on `type`. */
    private function validateFieldPayload(Request $request): array
    {
        $base = $request->validate([
            'type' => ['required', 'in:'.implode(',', FormFieldEngine::FIELD_TYPES)],
            'page' => ['required', 'integer', 'min:1'],
            'x' => ['required', 'numeric'],
            'y' => ['required', 'numeric'],
            'width' => ['required', 'numeric', 'gt:0'],
            'height' => ['required', 'numeric', 'gt:0'],
            'rotation' => ['sometimes', 'numeric'],
        ]);

        // `nullable` alongside `sometimes` on every optionally-empty string:
        // this app's global middleware converts an empty-string request
        // value to `null` before validation runs, so `sometimes` alone
        // (which only skips a key that's entirely ABSENT, not one present
        // with a `null` value) would reject a legitimately empty default
        // value/label/max-length — confirmed via a real 422 during this
        // phase's own browser testing before this fix.
        $rules = match ($base['type']) {
            'text' => [
                'params.required' => ['sometimes', 'boolean'],
                'params.defaultValue' => ['sometimes', 'nullable', 'string'],
                'params.maxLength' => ['sometimes', 'nullable', 'integer', 'min:0'],
                'params.multiline' => ['sometimes', 'boolean'],
            ],
            'date' => [
                'params.required' => ['sometimes', 'boolean'],
                'params.defaultValue' => ['sometimes', 'nullable', 'string'],
                'params.dateFormat' => ['sometimes', 'nullable', 'string'],
            ],
            'checkbox' => [
                'params.required' => ['sometimes', 'boolean'],
                'params.label' => ['sometimes', 'nullable', 'string'],
                'params.defaultChecked' => ['sometimes', 'boolean'],
            ],
            'radio' => [
                'params.required' => ['sometimes', 'boolean'],
                'params.groupName' => ['required', 'string'],
                'params.optionValue' => ['required', 'string'],
                'params.defaultSelected' => ['sometimes', 'boolean'],
            ],
            'dropdown' => [
                'params.required' => ['sometimes', 'boolean'],
                'params.options' => ['required', 'array', 'min:1'],
                'params.options.*' => ['string'],
                'params.defaultValue' => ['sometimes', 'nullable', 'string'],
            ],
            'signature' => [
                'params.label' => ['sometimes', 'nullable', 'string'],
            ],
            default => throw FormException::unknownFieldType($base['type']),
        };

        $params = $request->validate(array_merge(['params' => ['required', 'array']], $rules));

        return array_merge($base, $params);
    }
}
