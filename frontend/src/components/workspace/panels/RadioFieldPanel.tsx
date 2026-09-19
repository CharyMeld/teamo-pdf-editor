import { useEffect, useState } from "react";
import { useFormFields } from "../../../forms/useFormFields";
import type { RadioFieldParams } from "../../../lib/api";
import Button from "../../ui/Button";
import Panel from "../../ui/Panel";
import FormFieldPanelFooter from "./FormFieldPanelFooter";

/** Real, editable controls for one option of a radio group — TCPDF/the
 * real PDF spec models a whole group as ONE AcroForm field with several
 * mutually-exclusive options (see `FormFieldEngine::drawRadioGroup()`),
 * so each placed radio button here is one option; "selecting" it sets the
 * whole group's real current value (via `fillValues`, keyed by
 * `groupName` — see `FormFieldService::fillValues()`'s docblock for why
 * a radio group's fill key is the group name, not an individual
 * fieldId). */
export default function RadioFieldPanel() {
  const { fields, selectedField, patchSelected, fillValues, busy } = useFormFields();
  const [local, setLocal] = useState<RadioFieldParams | null>(null);

  useEffect(() => {
    setLocal(null);
  }, [selectedField?.fieldId]);

  if (!selectedField || selectedField.type !== "radio") {
    return (
      <Panel title="Radio Button">
        <p className="text-xs text-text-subtle">No radio button selected.</p>
      </Panel>
    );
  }

  const serverParams = selectedField.params as RadioFieldParams;
  const params = local ?? serverParams;
  const groupSize = fields.filter(
    (f) => f.type === "radio" && (f.params as RadioFieldParams).groupName === params.groupName,
  ).length;

  return (
    <Panel title="Radio Button">
      <p className="mb-2 text-[10px] text-text-subtle">
        Part of group "{params.groupName}" ({groupSize} option{groupSize === 1 ? "" : "s"}).
      </p>

      <label className="mb-2 flex flex-col gap-1 text-xs text-text-muted">
        Group name
        <input
          type="text"
          key={selectedField.fieldId}
          defaultValue={params.groupName}
          disabled={busy}
          onBlur={(e) => void patchSelected({ params: { groupName: e.target.value } })}
          className="rounded border border-border bg-bg px-1.5 py-1 text-xs text-text"
        />
      </label>
      <label className="mb-2 flex flex-col gap-1 text-xs text-text-muted">
        Option value
        <input
          type="text"
          key={selectedField.fieldId}
          defaultValue={params.optionValue}
          disabled={busy}
          onBlur={(e) => void patchSelected({ params: { optionValue: e.target.value } })}
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

      <Button
        variant={params.defaultSelected ? "primary" : "secondary"}
        size="sm"
        disabled={busy}
        onClick={() => void fillValues({ [params.groupName]: params.optionValue })}
      >
        {params.defaultSelected ? "Selected" : "Select this option"}
      </Button>

      <FormFieldPanelFooter />
    </Panel>
  );
}
