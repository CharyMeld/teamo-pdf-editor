import { useAnnotations } from "../../../annotations/useAnnotations";
import { ColorField } from "../../../annotations/AnnotationStyleFields";
import { TextStyleFields } from "../../../content-editor/TextStyleFields";
import type { TextBoxAnnotationParams, TextObjectParams } from "../../../lib/api";
import IconButton from "../../ui/IconButton";
import Panel from "../../ui/Panel";
import Spinner from "../../ui/Spinner";

/** Real, editable controls for a selected "Text box" annotation — reuses
 * Phase 4's exact TextStyleFields (font/size/bold/italic/align/color/line
 * spacing) since the shape is identical, plus this type's own optional
 * background/border color. Style toggles commit immediately; the text
 * content itself commits on blur, matching Phase 4's TextObjectPanel. */
export default function TextBoxAnnotationPanel() {
  const { selectedAnnotation, patchSelected, deleteSelected, duplicateSelected, busy } = useAnnotations();

  if (!selectedAnnotation || selectedAnnotation.type !== "text_box") {
    return (
      <Panel title="Text Box Selection">
        <p className="text-xs text-text-subtle">No text box selected.</p>
      </Panel>
    );
  }

  const params = selectedAnnotation.params as TextBoxAnnotationParams;

  return (
    <Panel title="Text Box">
      <textarea
        rows={3}
        defaultValue={params.text}
        onBlur={(e) => {
          if (e.target.value !== params.text) void patchSelected({ params: { text: e.target.value } });
        }}
        className="mb-2 w-full resize-none rounded border border-border bg-bg px-1.5 py-1 text-xs text-text"
      />
      <TextStyleFields
        params={params as TextObjectParams}
        onChange={(updater) => {
          const next = typeof updater === "function" ? updater(params as TextObjectParams) : updater;
          void patchSelected({ params: { ...next } });
        }}
        disabled={busy}
      />
      <div className="mt-2 flex flex-col gap-1.5 border-t border-border pt-2">
        <ColorField
          label="Background"
          value={params.backgroundColor ?? "#FFFFFF"}
          onChange={(backgroundColor) => void patchSelected({ params: { backgroundColor } })}
          disabled={busy}
        />
        <ColorField
          label="Border"
          value={params.borderColor ?? "#000000"}
          onChange={(borderColor) => void patchSelected({ params: { borderColor } })}
          disabled={busy}
        />
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-border pt-2">
        <div className="flex items-center gap-1">
          <IconButton icon="duplicate" label="Duplicate" size="sm" disabled={busy} onClick={() => void duplicateSelected()} />
          <IconButton icon="trash" label="Delete" size="sm" disabled={busy} onClick={() => void deleteSelected()} />
        </div>
        {busy && <Spinner size={14} label="Saving…" />}
      </div>
    </Panel>
  );
}
