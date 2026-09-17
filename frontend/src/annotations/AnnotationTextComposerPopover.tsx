import { useEffect, useRef, useState } from "react";
import Button from "../components/ui/Button";
import Spinner from "../components/ui/Spinner";

interface Props {
  box: { x: number; y: number; width: number; height: number };
  scale: number;
  heightPx: number;
  busy: boolean;
  onConfirm: (text: string) => void;
  onCancel: () => void;
}

/** A minimal text-entry popover for placing a "Text box" annotation — just
 * the content, since style (font/size/color/background/border) is edited
 * afterward in the Smart Inspector (TextBoxAnnotationPanel), the same
 * "placement asks for what a sensible default can't cover, the rest is
 * editable after" split Phase 4's TextComposerPopover established. */
export default function AnnotationTextComposerPopover({ box, scale, heightPx, busy, onConfirm, onCancel }: Props) {
  const [text, setText] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    containerRef.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
  }, []);

  const left = box.x * scale;
  const top = heightPx - (box.y + box.height) * scale;
  const popoverBelow = top + box.height * scale + 100 < heightPx;

  return (
    <div
      ref={containerRef}
      className="absolute z-20 w-64 rounded-md border border-border bg-surface p-2 shadow-lg"
      style={{ left, top: popoverBelow ? top + box.height * scale + 4 : Math.max(0, top - 104) }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <textarea
        autoFocus
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type text…"
        className="mb-2 w-full resize-none rounded border border-border bg-bg px-1.5 py-1 text-xs text-text"
      />
      <div className="flex items-center justify-end gap-1.5">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        {busy ? (
          <Spinner size={14} label="Adding…" />
        ) : (
          <Button size="sm" variant="primary" disabled={!text.trim()} onClick={() => onConfirm(text)}>
            Add text box
          </Button>
        )}
      </div>
    </div>
  );
}
