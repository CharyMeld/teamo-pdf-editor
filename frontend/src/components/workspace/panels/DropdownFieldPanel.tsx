import { useEffect, useState } from "react";
import { useFormFields } from "../../../forms/useFormFields";
import type { DropdownFieldParams } from "../../../lib/api";
import Panel from "../../ui/Panel";
import FormFieldPanelFooter from "./FormFieldPanelFooter";

/** Real, editable controls for a selected dropdown field: its option list
 * (one per line), required, and the currently-selected option (committed
 * via `fillValues`, the same mechanism Fill mode uses — see
 * `FormFieldService::fillValues()`'s docblock for why a dropdown's stored
 * "default" value literally IS its real current selection). Uses the
 * same optimistic local-state overlay as the other field panels for the
 * immediately-committing select/checkbox. */
export default function DropdownFieldPanel() {
  const { selectedField, patchSelected, fillValues, busy } = useFormFields();
  const [local, setLocal] = useState<DropdownFieldParams | null>(null);

  useEffect(() => {
    setLocal(null);
  }, [selectedField?.fieldId]);

  if (!selectedField || selectedField.type !== "dropdown") {
    return (
      <Panel title="Dropdown Field">
        <p className="text-xs text-text-subtle">No dropdown selected.</p>
      </Panel>
    );
  }

  const serverParams = selectedField.params as DropdownFieldParams;
  const params = local ?? serverParams;

  return (
    <Panel title="Dropdown Field">
      <label className="mb-2 flex flex-col gap-1 text-xs text-text-muted">
        Current selection
        <select
          value={params.defaultValue}
          disabled={busy}
          onChange={(e) => {
            setLocal({ ...params, defaultValue: e.target.value });
            void fillValues({ [selectedField.fieldId]: e.target.value });
          }}
          className="rounded border border-border bg-bg px-1.5 py-1 text-xs text-text"
        >
          <option value="">— none —</option>
          {params.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>

      <label className="mb-2 flex flex-col gap-1 text-xs text-text-muted">
        Options (one per line)
        <textarea
          key={selectedField.fieldId}
          rows={4}
          defaultValue={params.options.join("\n")}
          disabled={busy}
          onBlur={(e) =>
            void patchSelected({
              params: {
                options: e.target.value
                  .split("\n")
                  .map((o) => o.trim())
                  .filter((o) => o !== ""),
              },
            })
          }
          className="resize-none rounded border border-border bg-bg px-1.5 py-1 text-xs text-text"
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
