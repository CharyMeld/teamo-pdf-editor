import { useEffect, useRef, useState } from "react";
import type { ContentBox, TextAlign, TextObjectParams } from "../lib/api";
import Button from "../components/ui/Button";
import Spinner from "../components/ui/Spinner";
import { FONT_OPTIONS, TextStyleFields } from "./TextStyleFields";

interface Props {
  box: ContentBox;
  scale: number;
  heightPx: number;
  isOverlayEdit: boolean;
  initialParams: TextObjectParams;
  busy: boolean;
  onConfirm: (params: TextObjectParams) => void;
  onCancel: () => void;
}

/** The inline text-entry + style toolbar shown after drawing a placement
 * box (see ContentObjectLayer) — positioned right over the box the user
 * just drew, so typing and styling both happen in context rather than in a
 * separate modal. Confirming calls the real create endpoint (via
 * ContentObjectLayer's onConfirm); nothing here persists on its own. */
export default function TextComposerPopover({
  box,
  scale,
  heightPx,
  isOverlayEdit,
  initialParams,
  busy,
  onConfirm,
  onCancel,
}: Props) {
  const [params, setParams] = useState<TextObjectParams>(initialParams);
  const containerRef = useRef<HTMLDivElement>(null);

  // `popoverBelow` below only accounts for room within the PAGE, not the
  // browser's actual scrollable viewport — a box drawn in a page's lower
  // portion can still leave this popover's Confirm/Cancel row below the
  // visible fold. Scrolling it into view here (rather than relying on the
  // page-relative math) is what keeps a real user from having to hunt for
  // the button by scrolling the main canvas, which also silently changes
  // `view.currentPage` via the scroll-position IntersectionObserver.
  useEffect(() => {
    containerRef.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
  }, []);

  const left = box.x * scale;
  const top = heightPx - (box.y + box.height) * scale;
  // Flip the popover above the box when there isn't room below, so it
  // never renders off the bottom of the page.
  const popoverBelow = top + box.height * scale + 180 < heightPx;

  return (
    <div
      ref={containerRef}
      className="absolute z-20 w-72 rounded-md border border-border bg-surface p-2 shadow-lg"
      style={{ left, top: popoverBelow ? top + box.height * scale + 4 : Math.max(0, top - 184) }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {isOverlayEdit && (
        <p className="mb-1.5 rounded bg-warning-subtle px-1.5 py-1 text-[10px] leading-snug text-warning">
          This covers the original content with new text — it does not modify the underlying PDF
          text directly.
        </p>
      )}
      <textarea
        autoFocus
        rows={3}
        value={params.text}
        onChange={(e) => setParams((p) => ({ ...p, text: e.target.value }))}
        placeholder="Type text…"
        className="mb-2 w-full resize-none rounded border border-border bg-bg px-1.5 py-1 text-xs text-text"
      />
      <TextStyleFields params={params} onChange={setParams} />
      <div className="mt-2 flex items-center justify-end gap-1.5">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        {busy ? (
          <Spinner size={14} label="Adding…" />
        ) : (
          <Button size="sm" variant="primary" disabled={!params.text.trim()} onClick={() => onConfirm(params)}>
            {isOverlayEdit ? "Replace text" : "Add text"}
          </Button>
        )}
      </div>
    </div>
  );
}

export { FONT_OPTIONS };
export type { TextAlign };
