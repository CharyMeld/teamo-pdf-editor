import { useEffect, useState } from "react";
import { useFormFields } from "../../../forms/useFormFields";
import type { TextFieldParams } from "../../../lib/api";
import Panel from "../../ui/Panel";
import FormFieldPanelFooter from "./FormFieldPanelFooter";

/** Real, editable controls for a selected text field: required, max
 * length, multiline (design properties), and the field's actual current
 * value (its real `/V` in the produced PDF — committed via `fillValues`,
 * the same "fill/save" action the FORMS tab's Fill mode uses, since a
 * field's stored default value literally IS its current value — see
 * `FormFieldService::fillValues()`'s docblock).
 *
 * Every immediately-committing control (the two checkboxes) uses an
 * optimistic local-state overlay, reset only on field-selection change —
 * the same pattern Phase 6's `ScanImageEditorPanel` established for a
 * controlled input bound directly to server state, confirmed necessary
 * again here via a real Playwright checkbox-toggle failure during this
 * phase's own testing (see `CheckboxFieldPanel`'s docblock for the full
 * finding). */
export default function TextFieldPanel() {
  const { selectedField, patchSelected, fillValues, busy } = useFormFields();
  const [localValue, setLocalValue] = useState<string | null>(null);
  const [local, setLocal] = useState<TextFieldParams | null>(null);

  useEffect(() => {
    setLocalValue(null);
    setLocal(null);
  }, [selectedField?.fieldId]);

  if (!selectedField || selectedField.type !== "text") {
    return (
      <Panel title="Text Field">
        <p className="text-xs text-text-subtle">No text field selected.</p>
      </Panel>
    );
  }

  const serverParams = selectedField.params as TextFieldParams;
  const params = local ?? serverParams;
  const value = localValue ?? serverParams.defaultValue;

  async function flushValue() {
    if (localValue === null || localValue === serverParams.defaultValue) {
      setLocalValue(null);

      return;
    }
    const next = localValue;
    await fillValues({ [selectedField!.fieldId]: next });
  }

  return (
    <Panel title="Text Field">
      <label className="mb-2 flex flex-col gap-1 text-xs text-text-muted">
        Current value
        <input
          type="text"
          value={value}
          onChange={(e) => setLocalValue(e.target.value)}
          onBlur={() => void flushValue()}
          disabled={busy}
          className="rounded border border-border bg-bg px-1.5 py-1 text-xs text-text"
        />
      </label>

      <label className="mb-1.5 flex items-center gap-1.5 text-xs text-text-muted">
        <input
          type="checkbox"
          checked={params.required}
          disabled={busy}
          onChange={(e) => {
            setLocal({ ...params, required: e.target.checked });
            void patchSelected({ params: { required: e.target.checked } });
          }}
        />
        Required
      </label>
      <label className="mb-1.5 flex items-center gap-1.5 text-xs text-text-muted">
        <input
          type="checkbox"
          checked={params.multiline}
          disabled={busy}
          onChange={(e) => {
            setLocal({ ...params, multiline: e.target.checked });
            void patchSelected({ params: { multiline: e.target.checked } });
          }}
        />
        Multi-line
      </label>
      <label className="mb-2 flex items-center justify-between gap-2 text-xs text-text-muted">
        Max length
        <input
          type="number"
          min={0}
          value={params.maxLength ?? ""}
          disabled={busy}
          onChange={(e) => {
            const next = e.target.value === "" ? null : Number(e.target.value);
            setLocal({ ...params, maxLength: next });
            void patchSelected({ params: { maxLength: next } });
          }}
          className="w-20 rounded border border-border bg-bg px-1.5 py-1 text-right text-xs text-text"
        />
      </label>

      <FormFieldPanelFooter />
    </Panel>
  );
}
