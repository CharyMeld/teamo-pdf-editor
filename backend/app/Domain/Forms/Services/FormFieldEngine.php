<?php

namespace App\Domain\Forms\Services;

use App\Exceptions\FormException;
use setasign\Fpdi\Tcpdf\Fpdi;
use Throwable;

/**
 * `\setasign\Fpdi\Tcpdf\Fpdi`'s (and TCPDF's own) constructor
 * unconditionally sets a protected `$tcpdflink = true`, which makes
 * `Close()` (called from every `Output()`) stamp a real, literal
 * "Powered by TCPDF (www.tcpdf.org)" line onto the LAST page as genuine
 * page content — confirmed empirically: it survives `setPrintHeader(false)`/
 * `setPrintFooter(false)` and even a no-op `Footer()` override, since it's
 * drawn directly from `Close()`, not the footer hook. Setting the property
 * in this subclass's own declaration is silently overwritten by the
 * parent constructor (which runs after PHP's property-initializer phase)
 * — it must be reset in a constructor that calls `parent::__construct()`
 * first.
 */
class QuietFormFpdi extends Fpdi
{
    public function __construct(...$args)
    {
        parent::__construct(...$args);
        $this->tcpdflink = false;
    }
}

/**
 * The Forms module's first real logic (Phase 10): composes real, native,
 * interactive AcroForm fields on top of an existing PDF's real,
 * unmodified pages, via `setasign/fpdi`'s TCPDF-flavored import class
 * (`\setasign\Fpdi\Tcpdf\Fpdi`) + TCPDF's own native form-field API
 * (`TextField`/`CheckBox`/`RadioButton`/`ComboBox`). Unlike
 * `PdfContentEngine` (Phase 4, built on plain FPDF, which has no AcroForm
 * support at all), the fields this produces are genuine PDF `Widget`
 * annotations inside a real `/AcroForm` dictionary — verified via
 * `pdftk dump_data_fields` during this phase's own research, not merely
 * drawn to look like fields.
 *
 * Recomposition model: identical to `PdfContentEngine`/`FormFieldService`
 * (see that class's docblock) — every call rebuilds every page of the
 * source file from scratch, drawing the full *currently active* set of
 * fields. The caller always passes a "clean" source plus the complete
 * current field list.
 *
 * HONEST SCOPE BOUNDARY: `signature`-type fields are drawn as a plain
 * dashed placeholder box + label, NOT a real AcroForm field — a real
 * `/FT /Sig` field is tied to cryptographic signing, which is Phase 11's
 * explicit job (see ARCHITECTURE.md's Phase 10 section). The other five
 * types are all real, native, independently fillable widgets.
 */
class FormFieldEngine
{
    public const FIELD_TYPES = ['text', 'checkbox', 'radio', 'dropdown', 'date', 'signature'];

    /**
     * @param  array<int, list<array{fieldId: string, type: string, x: float, y: float, width: float, height: float, rotation: float, active: bool, params: array}>>  $fieldsByPage
     *                                                                                                                                                                               Keyed by 1-based page number. Only `active === true` entries are drawn.
     */
    public function compose(string $sourcePath, string $outputPath, array $fieldsByPage): void
    {
        $pdf = new QuietFormFpdi('P', 'pt');
        $pdf->setPrintHeader(false);
        $pdf->setPrintFooter(false);
        $pdf->SetAutoPageBreak(false);
        $pdf->SetMargins(0, 0, 0);

        try {
            $pageCount = $pdf->setSourceFile($sourcePath);
        } catch (Throwable $e) {
            throw FormException::processingFailed('could not read the source PDF for form editing: '.$e->getMessage());
        }

        for ($page = 1; $page <= $pageCount; $page++) {
            $templateId = $pdf->importPage($page);
            $size = $pdf->getTemplateSize($templateId);

            $pdf->AddPage($size['orientation'], [$size['width'], $size['height']]);
            $pdf->useTemplate($templateId, 0, 0, $size['width'], $size['height']);
            $pdf->SetFont('helvetica', '', 10);

            $fields = array_values(array_filter($fieldsByPage[$page] ?? [], fn (array $f) => $f['active'] ?? true));

            $radioGroups = [];
            foreach ($fields as $field) {
                if ($field['type'] === 'radio') {
                    $radioGroups[$field['params']['groupName']][] = $field;

                    continue;
                }
                $this->drawField($pdf, $size['height'], $field);
            }
            foreach ($radioGroups as $groupName => $options) {
                $this->drawRadioGroup($pdf, $size['height'], $groupName, $options);
            }
        }

        $bytes = $pdf->Output('doc.pdf', 'S');
        if (@file_put_contents($outputPath, $bytes) === false) {
            throw FormException::processingFailed('could not write the composed PDF.');
        }
    }

    private function drawField(QuietFormFpdi $pdf, float $pageHeightPt, array $field): void
    {
        $topY = $pageHeightPt - $field['y'] - $field['height'];
        $name = self::fieldName($field['fieldId']);
        $params = $field['params'];

        match ($field['type']) {
            'text', 'date' => $pdf->TextField($name, $field['width'], $field['height'], $this->textProp($field, $params), [], $field['x'], $topY),
            'checkbox' => $pdf->CheckBox($name, min($field['width'], $field['height']), (bool) ($params['defaultChecked'] ?? false), $this->baseProp($field, $params), [], 'Yes', $field['x'], $topY),
            'dropdown' => $pdf->ComboBox($name, $field['width'], $field['height'], $this->dropdownOptions($params), $this->dropdownProp($field, $params), [], $field['x'], $topY),
            'signature' => $this->drawSignaturePlaceholder($pdf, $field, $topY),
            default => throw FormException::unknownFieldType($field['type']),
        };
    }

    /** @param  list<array{fieldId: string, x: float, y: float, width: float, height: float, rotation: float, params: array}>  $options */
    private function drawRadioGroup(QuietFormFpdi $pdf, float $pageHeightPt, string $groupName, array $options): void
    {
        $groupField = self::radioGroupFieldName($groupName);
        foreach ($options as $option) {
            $params = $option['params'];
            $topY = $pageHeightPt - $option['y'] - $option['height'];
            $prop = $this->baseProp($option, $params);
            $pdf->RadioButton(
                $groupField,
                min($option['width'], $option['height']),
                $prop,
                [],
                (string) $params['optionValue'],
                (bool) ($params['defaultSelected'] ?? false),
                $option['x'],
                $topY,
            );
        }
    }

    private function drawSignaturePlaceholder(QuietFormFpdi $pdf, array $field, float $topY): void
    {
        $pdf->SetDrawColorArray([120, 120, 120]);
        $pdf->SetLineStyle(['width' => 0.75, 'dash' => '2,2']);
        $pdf->Rect($field['x'], $topY, $field['width'], $field['height']);
        $pdf->SetTextColorArray([120, 120, 120]);
        $pdf->SetXY($field['x'], $topY);
        $pdf->Cell($field['width'], $field['height'], (string) ($field['params']['label'] ?? 'Sign here'), 0, 0, 'C');
        $pdf->SetDrawColorArray([0, 0, 0]);
        $pdf->SetTextColorArray([0, 0, 0]);
    }

    /** @return list<string> */
    private function dropdownOptions(array $params): array
    {
        $options = $params['options'] ?? [];

        return array_values(array_map('strval', $options));
    }

    private function dropdownProp(array $field, array $params): array
    {
        $prop = $this->baseProp($field, $params);
        if (! empty($params['defaultValue'])) {
            // A STRING sets the real current selection (-> `/V`, verified
            // via `TCPDF_STATIC::getAnnotOptFromJSProp()`); an ARRAY here
            // is for an entirely different purpose (per-option export-
            // value overrides) and silently produces no real selection —
            // confirmed empirically: an array value passed `pdftk
            // dump_data_fields` with no `FieldValue:` line at all despite
            // a value being "set".
            $prop['value'] = (string) $params['defaultValue'];
        }

        return $prop;
    }

    private function textProp(array $field, array $params): array
    {
        $prop = $this->baseProp($field, $params);
        $prop['value'] = (string) ($params['defaultValue'] ?? '');
        if (! empty($params['maxLength'])) {
            $prop['charLimit'] = (int) $params['maxLength'];
        }
        if (! empty($params['multiline'])) {
            $prop['multiline'] = 'true';
        }

        return $prop;
    }

    /**
     * Real TCPDF form-field property keys, verified against
     * `TCPDF_STATIC::getAnnotOptFromJSProp()` before use — `required` is a
     * literal STRING `'true'`/`'false'` (TCPDF mirrors Adobe's JavaScript
     * form-field API convention, not a PHP bool), and `rotation` is a real
     * per-widget property (`/MK /R`), not something applied by the caller.
     */
    private function baseProp(array $field, array $params): array
    {
        $prop = [
            'required' => ! empty($params['required']) ? 'true' : 'false',
        ];
        if (($field['rotation'] ?? 0.0) != 0.0) {
            $prop['rotation'] = (int) round($field['rotation']);
        }

        return $prop;
    }

    /** Public + static: `FormFillService` needs the identical name derivation to address the real PDF field pdftk fills. */
    public static function fieldName(string $fieldId): string
    {
        return 'field_'.preg_replace('/[^a-zA-Z0-9_]/', '_', $fieldId);
    }

    public static function radioGroupFieldName(string $groupName): string
    {
        return self::fieldName('radio_'.$groupName);
    }
}
