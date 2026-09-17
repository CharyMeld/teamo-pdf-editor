import { useEffect, useId, useRef, type ReactNode } from "react";
import IconButton from "./IconButton";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** "md" (default, `max-w-md`) fits every existing single-field/preview
   * dialog. "lg" (`max-w-5xl`) is for a genuinely content-heavy workflow —
   * added for Phase 6's multi-image scan/clean/reorder wizard, the first
   * dialog that doesn't fit in a compact single-purpose box. */
  size?: "md" | "lg";
}

const SIZE_CLASSES: Record<"md" | "lg", string> = {
  md: "max-w-md",
  lg: "max-w-5xl",
};

/** Real modal dialog primitive: role="dialog"/aria-modal, a focus trap
 * (Tab cycles within it, Escape closes and returns focus to whatever
 * opened it), and click-outside-to-close. Both the Open-document dialog
 * and the password-unlock prompt render through this instead of one-off
 * markup. */
export default function Dialog({ open, onClose, title, children, size = "md" }: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = window.document.activeElement as HTMLElement | null;
    const node = dialogRef.current;

    const getFocusable = () =>
      node?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), select, textarea, [tabindex]:not([tabindex="-1"])',
      ) ?? null;

    getFocusable()?.[0]?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = getFocusable();
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && window.document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && window.document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
        className={`max-h-[85vh] w-full ${SIZE_CLASSES[size]} overflow-y-auto rounded-lg border border-border bg-surface p-4 shadow-lg`}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id={titleId} className="text-sm font-semibold text-text">
            {title}
          </h2>
          <IconButton icon="close" label="Close dialog" onClick={onClose} size="sm" />
        </div>
        {children}
      </div>
    </div>
  );
}
