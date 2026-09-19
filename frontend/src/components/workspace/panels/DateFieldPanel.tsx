import { useEffect, useState } from "react";
import { useFormFields } from "../../../forms/useFormFields";
import type { DateFieldParams } from "../../../lib/api";
import Panel from "../../ui/Panel";
import FormFieldPanelFooter from "./FormFieldPanelFooter";

/** A real AcroForm text field with a stored date-format hint (see
 * `FormFieldService`'s docblock) — no native calendar widget or embedded
 * validation script, honestly not attempted; the format is shown as
 * placeholder guidance only. Uses the same optimistic local-state overlay
 * as `CheckboxFieldPanel`/`TextFieldPanel` for the immediately-committing
 * "Required" checkbox. */
export default function DateFieldPanel() {
  const { selectedField, patchSelected, fillValues, busy } = useFormFields();
  const [localValue, setLocalValue] = useState<string | null>(null);
  const [local, setLocal] = useState<DateFieldParams | null>(null);

  useEffect(() => {
    setLocalValue(null);
    setLocal(null);
  }, [selectedField?.fieldId]);

  if (!selectedField || selectedField.type !== "date") {
    return (
      <Panel title="Date Field">
        <p className="text-xs text-text-subtle">No date field selected.</p>
      </Panel>
    );
  }

  const serverParams = selectedField.params as DateFieldParams;
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
    <Panel title="Date Field">
      <label className="mb-2 flex flex-col gap-1 text-xs text-text-muted">
        Current value
        <input
          type="text"
          placeholder={params.dateFormat}
          value={value}
          onChange={(e) => setLocalValue(e.target.value)}
          onBlur={() => void flushValue()}
          disabled={busy}
          className="rounded border border-border bg-bg px-1.5 py-1 text-xs text-text"
        />
      </label>

      <label className="mb-2 flex items-center justify-between gap-2 text-xs text-text-muted">
        Format hint
        <input
          type="text"
          value={params.dateFormat}
          disabled={busy}
          onChange={(e) => {
            setLocal({ ...params, dateFormat: e.target.value });
            void patchSelected({ params: { dateFormat: e.target.value } });
          }}
          className="w-28 rounded border border-border bg-bg px-1.5 py-1 text-right text-xs text-text"
        />
      </label>
      <label className="mb-2 flex items-center gap-1.5 text-xs text-text-muted">
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

      <FormFieldPanelFooter />
    </Panel>
  );
}
