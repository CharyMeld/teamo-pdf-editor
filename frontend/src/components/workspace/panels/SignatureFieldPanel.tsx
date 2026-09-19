import { useFormFields } from "../../../forms/useFormFields";
import type { SignatureFieldParams } from "../../../lib/api";
import Panel from "../../ui/Panel";
import FormFieldPanelFooter from "./FormFieldPanelFooter";

/** A signature field here is a real, movable/resizable PLACEHOLDER only —
 * not an interactive AcroForm field (a real `/FT /Sig` field is tied to
 * cryptographic signing, a later phase's job — see `FormFieldEngine`'s
 * docblock for the full honest scope boundary). No "fill" action is
 * offered here; that's the explicit boundary, not an oversight. */
export default function SignatureFieldPanel() {
  const { selectedField, patchSelected, busy } = useFormFields();

  if (!selectedField || selectedField.type !== "signature") {
    return (
      <Panel title="Signature Placeholder">
        <p className="text-xs text-text-subtle">No signature placeholder selected.</p>
      </Panel>
    );
  }

  const params = selectedField.params as SignatureFieldParams;

  return (
    <Panel title="Signature Placeholder">
      <p className="mb-2 rounded bg-warning-subtle px-1.5 py-1 text-[10px] leading-snug text-warning">
        This is a visual placeholder only — not yet a fillable, interactive
        signature field. Real signing (draw/type/upload) arrives in a
        later phase.
      </p>
      <label className="mb-2 flex flex-col gap-1 text-xs text-text-muted">
        Label
        <input
          type="text"
          key={selectedField.fieldId}
          defaultValue={params.label}
          disabled={busy}
          onBlur={(e) => void patchSelected({ params: { label: e.target.value } })}
          className="rounded border border-border bg-bg px-1.5 py-1 text-xs text-text"
        />
      </label>

      <FormFieldPanelFooter />
    </Panel>
  );
}
