import { useState } from "react";
import { useContentObjects } from "../../../content-editor/useContentObjects";
import { TextStyleFields } from "../../../content-editor/TextStyleFields";
import type { TextObjectParams } from "../../../lib/api";
import Button from "../../ui/Button";
import IconButton from "../../ui/IconButton";
import Panel from "../../ui/Panel";
import Spinner from "../../ui/Spinner";

/** Real, editable controls for the selected text object — font, size,
 * bold, italic, color, alignment, line spacing, and its actual content —
 * every change here calls PATCH .../content/objects/{id} on blur (not per
 * keystroke), same "contextual Smart Inspector controls" the user asked
 * for. Shown for both `type: "text"` (added content) and
 * `type: "text_overlay_edit"` (a labeled overlay covering original
 * content) — the latter gets an explicit note distinguishing it from true
 * source modification. */
export default function TextObjectPanel() {
  const { selectedObject, patchSelected, deleteSelected, duplicateSelected, busy } = useContentObjects();
  const [localParams, setLocalParams] = useState<TextObjectParams | null>(null);

  if (!selectedObject || selectedObject.type === "image") {
    return (
      <Panel title="Text Selection">
        <p className="text-xs text-text-subtle">No text object selected.</p>
      </Panel>
    );
  }

  const serverParams = selectedObject.params as TextObjectParams;
  const params = localParams ?? serverParams;

  function commitIfChanged(next: TextObjectParams) {
    setLocalParams(next);
  }

  async function flush() {
    if (!localParams) return;
    const diff: Partial<TextObjectParams> = {};
    (Object.keys(localParams) as Array<keyof TextObjectParams>).forEach((k) => {
      if (localParams[k] !== serverParams[k]) (diff as Record<string, unknown>)[k] = localParams[k];
    });
    setLocalParams(null);
    if (Object.keys(diff).length > 0) await patchSelected({ params: diff });
  }

  return (
    <Panel title={selectedObject.type === "text_overlay_edit" ? "Text Edit (Overlay)" : "Text Selection"}>
      {selectedObject.type === "text_overlay_edit" && (
        <p className="mb-2 rounded bg-warning-subtle px-1.5 py-1 text-[10px] leading-snug text-warning">
          This covers original page content with new text — it does not modify the underlying PDF
          text directly.
        </p>
      )}
      {params.isSignature && (
        <p className="mb-2 rounded bg-warning-subtle px-1.5 py-1 text-[10px] leading-snug text-warning">
          This is a visual signature mark, not a legally verified cryptographic/digital signature.
        </p>
      )}
      <textarea
        rows={3}
        value={params.text}
        onChange={(e) => commitIfChanged({ ...params, text: e.target.value })}
        onBlur={() => void flush()}
        className="mb-2 w-full resize-none rounded border border-border bg-bg px-1.5 py-1 text-xs text-text"
      />
      <TextStyleFields
        params={params}
        onChange={(updater) => {
          const next = typeof updater === "function" ? updater(params) : updater;
          commitIfChanged(next);
          // Style toggles (bold/italic/align/font/color) commit immediately
          // — only free-text fields (text/size/lineSpacing typed digit by
          // digit) wait for blur, handled by their own onBlur below.
          void patchSelected({ params: next }).then(() => setLocalParams(null));
        }}
        disabled={busy}
      />
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

export { Button };
