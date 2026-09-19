<?php

namespace App\Domain\Forms\Services;

use App\Domain\Audit\Services\AuditLogger;
use App\Domain\Editing\Services\WorkingCopyManager;
use App\Exceptions\FormException;
use App\Exceptions\PageOperationException;
use App\Models\Document;
use App\Models\User;
use Illuminate\Support\Str;

/**
 * Phase 10 (PDF forms — design: create/move/resize/edit properties/
 * duplicate/delete; AND fill/save/clear — see `fillValues()`'s docblock
 * for why filling lives here too, not in a separate service): manages
 * form field placement via `FormFieldEngine`.
 *
 * A PARALLEL, independent sibling to Phase 4's `ContentObjectService` and
 * Phase 5's `AnnotationService` — not a modification of either, and
 * neither needed any change for this to exist. Reuses the exact same
 * recomposition-chain mechanism those two already established, generalized
 * to a THIRD independent chain distinguished by its own `form_field_*`
 * operation-type prefix (see `currentChainState()`) — deliberately NOT
 * just `form_*`, which would collide with nothing else today but is a
 * real footgun for a future sibling module named `form_something`.
 * Interleaving with the other two chains follows the identical
 * "flattening" rule `AnnotationService`'s docblock already documents:
 * whichever chain ran most recently owns independently-editable objects;
 * anything from a different chain baked in earlier is now permanent page
 * content.
 */
class FormFieldService
{
    public function __construct(
        private readonly FormFieldEngine $engine,
        private readonly WorkingCopyManager $working,
    ) {}

    /** @return array{operationId: int, sequenceNumber: int, fieldId: string, pageCount: int, thumbnailJobId: int, status: string, canUndo: bool, canRedo: bool} */
    public function addField(Document $document, User $user, array $data): array
    {
        $pageCount = $this->working->currentPageCount($document);
        $page = (int) $data['page'];
        if ($page < 1 || $page > $pageCount) {
            throw PageOperationException::invalidPageNumbers([$page], $pageCount);
        }

        $type = $data['type'];
        if (! in_array($type, FormFieldEngine::FIELD_TYPES, true)) {
            throw FormException::unknownFieldType($type);
        }

        $params = $this->normalizeParams($type, $data['params'] ?? []);

        $fieldId = (string) Str::uuid();
        $field = [
            'fieldId' => $fieldId,
            'type' => $type,
            'page' => $page,
            'x' => (float) $data['x'],
            'y' => (float) $data['y'],
            'width' => (float) $data['width'],
            'height' => (float) $data['height'],
            'rotation' => (float) ($data['rotation'] ?? 0),
            'active' => true,
            'params' => $params,
        ];
        $this->assertPositiveSize($field);

        [$fields, $sourceStepId, $sourceVersionId] = $this->currentChainState($document);
        $fields[] = $field;

        $result = $this->recomposeAndCommit($document, $user, 'form_field_create', $fields, $sourceStepId, $sourceVersionId);

        AuditLogger::record('document.form.field_added', $document, ['fieldId' => $fieldId, 'type' => $type]);

        return $result + ['fieldId' => $fieldId];
    }

    /** @return array{operationId: int, sequenceNumber: int, fieldId: string, pageCount: int, thumbnailJobId: int, status: string, canUndo: bool, canRedo: bool} */
    public function updateField(Document $document, User $user, string $fieldId, array $changes): array
    {
        [$fields, $sourceStepId, $sourceVersionId] = $this->currentChainState($document);

        $found = false;
        foreach ($fields as &$field) {
            if ($field['fieldId'] !== $fieldId || ! $field['active']) {
                continue;
            }
            $found = true;

            foreach (['x', 'y', 'width', 'height', 'rotation'] as $numericField) {
                if (array_key_exists($numericField, $changes)) {
                    $field[$numericField] = (float) $changes[$numericField];
                }
            }
            if (array_key_exists('params', $changes) && is_array($changes['params'])) {
                $field['params'] = $this->normalizeParams($field['type'], array_merge($field['params'], $changes['params']));
            }
            $this->assertPositiveSize($field);
            break;
        }
        unset($field);

        if (! $found) {
            throw FormException::fieldNotFound();
        }

        $result = $this->recomposeAndCommit($document, $user, 'form_field_update', $fields, $sourceStepId, $sourceVersionId);

        AuditLogger::record('document.form.field_updated', $document, ['fieldId' => $fieldId]);

        return $result + ['fieldId' => $fieldId];
    }

    public function deleteField(Document $document, User $user, string $fieldId): array
    {
        [$fields, $sourceStepId, $sourceVersionId] = $this->currentChainState($document);

        $found = false;
        foreach ($fields as &$field) {
            if ($field['fieldId'] === $fieldId && $field['active']) {
                $field['active'] = false;
                $found = true;
                break;
            }
        }
        unset($field);

        if (! $found) {
            throw FormException::fieldNotFound();
        }

        $result = $this->recomposeAndCommit($document, $user, 'form_field_delete', $fields, $sourceStepId, $sourceVersionId);

        AuditLogger::record('document.form.field_deleted', $document, ['fieldId' => $fieldId]);

        return $result + ['fieldId' => $fieldId];
    }

    public function duplicateField(Document $document, User $user, string $fieldId): array
    {
        [$fields, $sourceStepId, $sourceVersionId] = $this->currentChainState($document);

        $source = null;
        foreach ($fields as $field) {
            if ($field['fieldId'] === $fieldId && $field['active']) {
                $source = $field;
                break;
            }
        }
        if ($source === null) {
            throw FormException::fieldNotFound();
        }

        $newFieldId = (string) Str::uuid();
        $clone = $source;
        $clone['fieldId'] = $newFieldId;
        $clone['x'] += 12.0;
        $clone['y'] -= 12.0;
        if ($clone['type'] === 'radio') {
            // A duplicated radio button joins the SAME group as a new,
            // distinct option — it needs its own optionValue, or TCPDF
            // would draw two widgets sharing one selectable value.
            $clone['params']['optionValue'] = $source['params']['optionValue'].'_copy';
        }
        $fields[] = $clone;

        $result = $this->recomposeAndCommit($document, $user, 'form_field_duplicate', $fields, $sourceStepId, $sourceVersionId);

        AuditLogger::record('document.form.field_duplicated', $document, ['fieldId' => $newFieldId, 'sourceFieldId' => $fieldId]);

        return $result + ['fieldId' => $newFieldId];
    }

    /**
     * Phase 10 (fill/save/clear): sets real values on already-placed
     * fields. Deliberately implemented as JUST ANOTHER `form_field_*`
     * chain mutation — updating each targeted field's own `params`
     * (`defaultValue`/`defaultChecked`/`defaultSelected`) and recomposing
     * through the exact same `FormFieldEngine::compose()` + `commitStep()`
     * path every other design mutation uses — NOT a separate pdftk-based
     * pass, despite `pdftk fill_form` being verified working during this
     * phase's research. A real bug was found switching between the two:
     * `FormFieldEngine::compose()` always rebuilds every field fresh from
     * its OWN stored default value; a value set out-of-band via pdftk
     * would be silently destroyed the next time ANY design mutation
     * (adding/moving/resizing a different field) recomposed the page.
     * Folding fill into the same chain fixes this by construction — and
     * turns out to need no second tool at all, since TCPDF's `value`/
     * `checked`/`selected` props ARE a field's real current value, not a
     * separate "default" distinct from it (confirmed via `pdftk
     * dump_data_fields` throughout this phase's testing — every prior
     * "defaultChecked: true" test already produced a real `FieldValue:
     * Yes`, never merely a cosmetic default).
     *
     * @param  array<string, mixed>  $values  keyed by fieldId, or (for a radio option) the group's groupName
     */
    public function fillValues(Document $document, User $user, array $values): array
    {
        if ($values === []) {
            throw FormException::invalidFieldParams('at least one field value must be given.');
        }

        [$fields, $sourceStepId, $sourceVersionId] = $this->currentChainState($document);
        $fields = $this->applyValues($fields, $values);

        $result = $this->recomposeAndCommit($document, $user, 'form_field_fill', $fields, $sourceStepId, $sourceVersionId);

        AuditLogger::record('document.form.filled', $document, ['keys' => array_keys($values)]);

        return $result;
    }

    /** @param  list<string>|null  $fieldKeys  null clears every fillable field */
    public function clearValues(Document $document, User $user, ?array $fieldKeys): array
    {
        [$fields, $sourceStepId, $sourceVersionId] = $this->currentChainState($document);
        $keys = $fieldKeys ?? $this->allFillableKeys($fields);
        $values = array_fill_keys($keys, '');

        $fields = $this->applyValues($fields, $values);

        $result = $this->recomposeAndCommit($document, $user, 'form_field_clear', $fields, $sourceStepId, $sourceVersionId);

        AuditLogger::record('document.form.cleared', $document, ['keys' => $keys]);

        return $result;
    }

    /** @return list<string> */
    private function allFillableKeys(array $fields): array
    {
        $keys = [];
        foreach ($fields as $field) {
            if (! $field['active'] || $field['type'] === 'signature') {
                continue;
            }
            $keys[] = $field['type'] === 'radio' ? $field['params']['groupName'] : $field['fieldId'];
        }

        return array_values(array_unique($keys));
    }

    /** @param  array<string, mixed>  $values  keyed by fieldId or groupName */
    private function applyValues(array $fields, array $values): array
    {
        $radioGroups = [];
        foreach ($fields as $field) {
            if ($field['type'] === 'radio' && $field['active']) {
                $radioGroups[$field['params']['groupName']] = true;
            }
        }

        $unresolved = $values;
        foreach ($fields as &$field) {
            if (! $field['active']) {
                continue;
            }

            if ($field['type'] === 'radio' && array_key_exists($field['params']['groupName'], $values)) {
                $selected = (string) $values[$field['params']['groupName']];
                $field['params']['defaultSelected'] = $field['params']['optionValue'] === $selected;
                unset($unresolved[$field['params']['groupName']]);

                continue;
            }

            if (! array_key_exists($field['fieldId'], $values)) {
                continue;
            }
            $value = $values[$field['fieldId']];
            unset($unresolved[$field['fieldId']]);

            $field['params'] = match ($field['type']) {
                'signature' => throw FormException::notFillable('signature'),
                'checkbox' => array_merge($field['params'], ['defaultChecked' => $this->isTruthy($value)]),
                default => array_merge($field['params'], ['defaultValue' => (string) $value]),
            };
        }
        unset($field);

        // A key that matched neither a fieldId nor a radio groupName means
        // the caller referenced a field that doesn't exist (or isn't
        // active) — a real, reportable error, not a silent no-op.
        foreach (array_keys($unresolved) as $key) {
            if (! isset($radioGroups[$key])) {
                throw FormException::fieldNotFound();
            }
        }

        return $fields;
    }

    private function isTruthy(mixed $value): bool
    {
        return $value === true || $value === 'true' || $value === '1' || $value === 1 || $value === 'Yes';
    }

    /** Real current active fields' design metadata — each field's own `params` (defaultValue/defaultChecked/defaultSelected) IS its real current value, not a separate store; see `fillValues()`'s docblock. */
    public function listActiveFields(Document $document, ?int $page = null): array
    {
        [$fields] = $this->currentChainState($document);

        $fields = array_values(array_filter($fields, fn (array $f) => $f['active']));
        if ($page !== null) {
            $fields = array_values(array_filter($fields, fn (array $f) => $f['page'] === $page));
        }

        return array_map(fn (array $f) => [
            'fieldId' => $f['fieldId'],
            'type' => $f['type'],
            'page' => $f['page'],
            'x' => $f['x'],
            'y' => $f['y'],
            'width' => $f['width'],
            'height' => $f['height'],
            'rotation' => $f['rotation'],
            'params' => $f['params'],
        ], $fields);
    }

    /**
     * @return array{0: list<array>, 1: ?int, 2: ?int}
     */
    private function currentChainState(Document $document): array
    {
        $currentStep = $document->current_step_id !== null ? $document->currentStep : null;

        if ($currentStep && str_starts_with($currentStep->operation_type, 'form_field_')) {
            $payload = $currentStep->payload;

            return [$payload['formFields'] ?? [], $payload['sourceStepId'] ?? null, $payload['sourceVersionId'] ?? null];
        }

        if ($currentStep) {
            return [[], $currentStep->id, null];
        }

        $version = $this->working->baseVersion($document);

        return [[], null, $version->id];
    }

    private function recomposeAndCommit(
        Document $document,
        User $user,
        string $operationType,
        array $fields,
        ?int $sourceStepId,
        ?int $sourceVersionId,
    ): array {
        $sourcePath = $this->working->resolveAbsolutePath($sourceStepId, $sourceVersionId);
        $pageCount = $this->working->currentPageCount($document);

        $fieldsByPage = [];
        foreach ($fields as $field) {
            if (! $field['active']) {
                continue;
            }
            $fieldsByPage[$field['page']][] = $field;
        }

        $scratch = $this->working->newScratchDir();
        try {
            $outPath = $scratch.'/result.pdf';
            $this->engine->compose($sourcePath, $outPath, $fieldsByPage);

            $stepResult = $this->working->commitStep($document, $user, $operationType, [
                'formFields' => $fields,
                'sourceStepId' => $sourceStepId,
                'sourceVersionId' => $sourceVersionId,
            ], $outPath, $pageCount);
        } finally {
            $this->working->cleanupScratchDir($scratch);
        }

        $step = $stepResult['step'];
        $job = $stepResult['job'];

        return [
            'operationId' => $step->id,
            'sequenceNumber' => $step->sequence_number,
            'pageCount' => $step->page_count_after,
            'thumbnailJobId' => $job->id,
            'status' => 'processing',
            'canUndo' => true,
            'canRedo' => false,
        ];
    }

    private function normalizeParams(string $type, array $params): array
    {
        $required = (bool) ($params['required'] ?? false);

        return match ($type) {
            'text' => [
                'required' => $required,
                'defaultValue' => (string) ($params['defaultValue'] ?? ''),
                'maxLength' => isset($params['maxLength']) ? max(0, (int) $params['maxLength']) : null,
                'multiline' => (bool) ($params['multiline'] ?? false),
            ],
            'date' => [
                'required' => $required,
                'defaultValue' => (string) ($params['defaultValue'] ?? ''),
                'dateFormat' => (string) ($params['dateFormat'] ?? 'YYYY-MM-DD'),
            ],
            'checkbox' => [
                'required' => $required,
                'label' => (string) ($params['label'] ?? ''),
                'defaultChecked' => (bool) ($params['defaultChecked'] ?? false),
            ],
            'radio' => $this->normalizeRadioParams($params, $required),
            'dropdown' => $this->normalizeDropdownParams($params, $required),
            'signature' => [
                'label' => (string) ($params['label'] ?? 'Sign here'),
            ],
            default => throw FormException::unknownFieldType($type),
        };
    }

    private function normalizeRadioParams(array $params, bool $required): array
    {
        $groupName = trim((string) ($params['groupName'] ?? ''));
        $optionValue = trim((string) ($params['optionValue'] ?? ''));
        if ($groupName === '' || $optionValue === '') {
            throw FormException::invalidFieldParams('a radio button requires both groupName and optionValue.');
        }

        return [
            'required' => $required,
            'groupName' => $groupName,
            'optionValue' => $optionValue,
            'defaultSelected' => (bool) ($params['defaultSelected'] ?? false),
        ];
    }

    private function normalizeDropdownParams(array $params, bool $required): array
    {
        $options = array_values(array_filter(array_map('trim', (array) ($params['options'] ?? [])), fn ($o) => $o !== ''));
        if ($options === []) {
            throw FormException::invalidFieldParams('a dropdown requires at least one option.');
        }

        return [
            'required' => $required,
            'options' => $options,
            'defaultValue' => (string) ($params['defaultValue'] ?? ''),
        ];
    }

    private function assertPositiveSize(array $field): void
    {
        if ($field['width'] <= 0 || $field['height'] <= 0) {
            throw FormException::invalidFieldParams('width and height must be positive.');
        }
    }
}
