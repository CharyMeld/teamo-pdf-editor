import { useFormFields } from "../../../forms/useFormFields";
import IconButton from "../../ui/IconButton";
import Spinner from "../../ui/Spinner";

/** Shared Duplicate/Delete/busy-spinner footer — same shape every other
 * Phase 4/5 property panel already uses (see ShapeAnnotationPanel etc.),
 * extracted once six form-field panels need the identical row. */
export default function FormFieldPanelFooter() {
  const { busy, duplicateSelected, deleteSelected } = useFormFields();

  return (
    <div className="mt-3 flex items-center justify-between border-t border-border pt-2">
      <div className="flex items-center gap-1">
        <IconButton icon="duplicate" label="Duplicate" size="sm" disabled={busy} onClick={() => void duplicateSelected()} />
        <IconButton icon="trash" label="Delete" size="sm" disabled={busy} onClick={() => void deleteSelected()} />
      </div>
      {busy && <Spinner size={14} label="Saving…" />}
    </div>
  );
}
