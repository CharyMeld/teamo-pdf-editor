import { useAnnotations } from "../../../annotations/useAnnotations";
import Panel from "../../ui/Panel";
import LineAnnotationPanel from "./LineAnnotationPanel";
import MarkupAnnotationPanel from "./MarkupAnnotationPanel";
import ShapeAnnotationPanel from "./ShapeAnnotationPanel";
import StampAnnotationPanel from "./StampAnnotationPanel";
import StickyNoteAnnotationPanel from "./StickyNoteAnnotationPanel";
import TextBoxAnnotationPanel from "./TextBoxAnnotationPanel";

/** Routes to the real, type-specific annotation panel — the Phase 5
 * equivalent of Phase 4's TextObjectPanel/ImageObjectPanel split, just
 * with more categories since there are 10 annotation types rather than 2.
 * Replaces the Phase 1 dev-stub `SelectionPanel` for `selection ===
 * "annotation"` now that real canvas selection exists (see
 * AnnotationLayer). */
export default function AnnotationPanel() {
  const { selectedAnnotation } = useAnnotations();

  if (!selectedAnnotation) {
    return (
      <Panel title="Annotation Selection">
        <p className="text-xs text-text-subtle">No annotation selected.</p>
      </Panel>
    );
  }

  switch (selectedAnnotation.type) {
    case "highlight":
    case "underline":
    case "strikethrough":
      return <MarkupAnnotationPanel />;
    case "rectangle":
    case "circle":
      return <ShapeAnnotationPanel />;
    case "freehand":
    case "arrow":
      return <LineAnnotationPanel />;
    case "text_box":
      return <TextBoxAnnotationPanel />;
    case "sticky_note":
      return <StickyNoteAnnotationPanel />;
    case "stamp":
      return <StampAnnotationPanel />;
    default:
      return null;
  }
}
