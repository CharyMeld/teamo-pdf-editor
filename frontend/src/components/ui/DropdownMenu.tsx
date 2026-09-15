import { useEffect, useRef, useState } from "react";

export interface DropdownItem {
  id: string;
  label: string;
  disabled?: boolean;
  disabledHint?: string;
  onSelect?: () => void;
}

interface DropdownMenuProps {
  items: DropdownItem[];
  renderTrigger: (props: {
    onClick: () => void;
    "aria-haspopup": "menu";
    "aria-expanded": boolean;
  }) => React.ReactElement;
  align?: "left" | "right";
}

/** Real keyboard-navigable dropdown: role="menu"/"menuitem", arrow-key
 * navigation, Escape closes and returns focus to the trigger, and clicking
 * outside closes it. Every ribbon dropdown/overflow menu is built from
 * this — never a styled div that merely looks like a menu. */
export default function DropdownMenu({ items, renderTrigger, align = "left" }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerButtonRef = useRef<HTMLElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!open) return;

    itemRefs.current[0]?.focus();

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function close(refocusTrigger: boolean) {
    setOpen(false);
    if (refocusTrigger) triggerButtonRef.current?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent, index: number) {
    const enabledIndices = items
      .map((item, i) => (item.disabled ? -1 : i))
      .filter((i) => i !== -1);
    const pos = enabledIndices.indexOf(index);

    if (event.key === "ArrowDown") {
      event.preventDefault();
      const next = enabledIndices[(pos + 1) % enabledIndices.length];
      itemRefs.current[next]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      const prev = enabledIndices[(pos - 1 + enabledIndices.length) % enabledIndices.length];
      itemRefs.current[prev]?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (event.key === "Tab") {
      close(false);
    }
  }

  const trigger = renderTrigger({
    onClick: () => setOpen((o) => !o),
    "aria-haspopup": "menu",
    "aria-expanded": open,
  });

  return (
    <div ref={containerRef} className="relative inline-flex">
      {/* Capture a ref to the trigger's underlying button without forcing
          callers to forwardRef — a thin wrapper span is enough since we
          only need it for click/focus targeting on close. */}
      <span
        ref={(node) => {
          triggerButtonRef.current = node?.querySelector("button") ?? null;
        }}
      >
        {trigger}
      </span>
      {open && (
        <div
          role="menu"
          className={[
            "absolute top-full z-50 mt-1 min-w-48 rounded-md border border-border bg-surface py-1 shadow-lg",
            align === "right" ? "right-0" : "left-0",
          ].join(" ")}
        >
          {items.map((item, index) => (
            <button
              key={item.id}
              ref={(node) => {
                itemRefs.current[index] = node;
              }}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              title={item.disabled ? item.disabledHint : undefined}
              onKeyDown={(e) => handleKeyDown(e, index)}
              onClick={() => {
                if (item.disabled) return;
                item.onSelect?.();
                close(true);
              }}
              className={[
                "flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-xs",
                item.disabled
                  ? "cursor-not-allowed text-text-subtle"
                  : "text-text hover:bg-surface-muted focus-visible:bg-surface-muted",
              ].join(" ")}
            >
              <span>{item.label}</span>
              {item.disabled && (
                <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] text-text-subtle">
                  Planned
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
