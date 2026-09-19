import { useFormFields } from "../../../forms/useFormFields";
import Panel from "../../ui/Panel";
import CheckboxFieldPanel from "./CheckboxFieldPanel";
import DateFieldPanel from "./DateFieldPanel";
import DropdownFieldPanel from "./DropdownFieldPanel";
import RadioFieldPanel from "./RadioFieldPanel";
import SignatureFieldPanel from "./SignatureFieldPanel";
import TextFieldPanel from "./TextFieldPanel";

/** Routes to the real, type-specific form-field panel — the Phase 10
 * equivalent of Phase 5's `AnnotationPanel` dispatch, for the six field
 * types instead of ten annotation types. */
export default function FormFieldPanel() {
  const { selectedField } = useFormFields();

  if (!selectedField) {
    return (
      <Panel title="Form Field Selection">
        <p className="text-xs text-text-subtle">No form field selected.</p>
      </Panel>
    );
  }

  switch (selectedField.type) {
    case "text":
      return <TextFieldPanel />;
    case "date":
      return <DateFieldPanel />;
    case "checkbox":
      return <CheckboxFieldPanel />;
    case "radio":
      return <RadioFieldPanel />;
    case "dropdown":
      return <DropdownFieldPanel />;
    case "signature":
      return <SignatureFieldPanel />;
    default:
      return null;
  }
}
