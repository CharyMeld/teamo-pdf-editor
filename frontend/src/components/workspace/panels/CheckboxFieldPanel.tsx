import { useEffect, useState } from "react";
import { useFormFields } from "../../../forms/useFormFields";
import type { CheckboxFieldParams } from "../../../lib/api";
import Panel from "../../ui/Panel";
import FormFieldPanelFooter from "./FormFieldPanelFooter";

/** Real, editable controls for a selected checkbox field: its label
 * (design-time only — the visible caption this app draws isn't part of
 * the real AcroForm value), required, and its actual checked state
 * (committed via `fillValues`, the same mechanism Fill mode uses).
 *
 * Uses an optimistic local-state overlay for every immediately-committing
 * control, reset only when the *selected field* changes — the same
 * pattern Phase 6's `ScanImageEditorPanel` established: a checkbox/select
 * bound directly to a prop that only updates once its round-trip
 * resolves visibly snaps back for the duration of the request, a real,
 * user-visible bug (confirmed here via a real Playwright `.check()`
 * failing with "did not change its state" during this phase's testing),
 * not merely a test-timing artifact.
 */
export default function CheckboxFieldPanel() {
  const { selectedField, patchSelected, fillValues, busy } = useFormFields();
  const [local, setLocal] = useState<CheckboxFieldParams | null>(null);

  useEffect(() => {
    setLocal(null);
  }, [selectedField?.fieldId]);

  if (!selectedField || selectedField.type !== "checkbox") {
    return (
      <Panel title="Checkbox Field">
        <p className="text-xs text-text-subtle">No checkbox selected.</p>
      </Panel>
    );
  }

  const serverParams = selectedField.params as CheckboxFieldParams;
  const params = local ?? serverParams;

  return (
    <Panel title="Checkbox Field">
      <label className="mb-2 flex items-center gap-1.5 text-xs text-text-muted">
        <input
          type="checkbox"
          checked={params.defaultChecked}
          disabled={busy}
          onChange={(e) => {
            setLocal({ ...params, defaultChecked: e.target.checked });
            void fillValues({ [selectedField.fieldId]: e.target.checked });
          }}
        />
        Checked
      </label>
      <label className="mb-2 flex flex-col gap-1 text-xs text-text-muted">
        Label
        <input
          type="text"
          value={params.label}
          disabled={busy}
          onChange={(e) => {
            setLocal({ ...params, label: e.target.value });
            void patchSelected({ params: { label: e.target.value } });
          }}
          className="rounded border border-border bg-bg px-1.5 py-1 text-xs text-text"
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
