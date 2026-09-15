import { cloneElement, useId, useRef, useState, type ReactElement } from "react";

interface TooltipProps {
  text: string;
  children: ReactElement<{
    "aria-describedby"?: string;
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
    onFocus?: () => void;
    onBlur?: () => void;
  }>;
  /** Extra hint shown after the main text, e.g. "Not yet available". */
  hint?: string;
}

/** Real hover/focus-triggered tooltip. Wraps a single focusable child and
 * wires aria-describedby so screen readers announce it too — this is what
 * every icon-only IconButton uses instead of relying on a bare title
 * attribute. */
export default function Tooltip({ text, hint, children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setVisible(true), 300);
  };
  const hide = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setVisible(false);
  };

  return (
    <span className="relative inline-flex">
      {cloneElement(children, {
        "aria-describedby": visible ? id : undefined,
        onMouseEnter: show,
        onMouseLeave: hide,
        onFocus: show,
        onBlur: hide,
      })}
      {visible && (
        <span
          role="tooltip"
          id={id}
          className="pointer-events-none absolute left-1/2 top-full z-50 mt-1.5 w-max max-w-56 -translate-x-1/2 rounded-md bg-slate-900 px-2 py-1 text-[11px] leading-snug text-white shadow-lg"
        >
          {text}
          {hint && <span className="block text-slate-300">{hint}</span>}
        </span>
      )}
    </span>
  );
}
