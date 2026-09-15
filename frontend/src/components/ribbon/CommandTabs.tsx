import { useRef } from "react";
import { TAB_IDS, type TabId } from "../../commands/types";

// Re-exported for backward-compatible imports within this phase's code.
export { TAB_IDS } from "../../commands/types";
export type { TabId } from "../../commands/types";
export const COMMAND_TABS = TAB_IDS;
export type CommandTab = TabId;

interface CommandTabsProps {
  activeTab: TabId;
  onSelect: (tab: TabId) => void;
}

/** role="tablist" with real roving-tabindex keyboard navigation: Left/Right
 * (and Up/Down) move focus between tabs, Home/End jump to the ends, and
 * only the active tab sits in the natural Tab order. */
export default function CommandTabs({ activeTab, onSelect }: CommandTabsProps) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function focusIndex(index: number) {
    const clamped = (index + TAB_IDS.length) % TAB_IDS.length;
    buttonRefs.current[clamped]?.focus();
    onSelect(TAB_IDS[clamped]);
  }

  function handleKeyDown(event: React.KeyboardEvent, index: number) {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        focusIndex(index + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        focusIndex(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusIndex(0);
        break;
      case "End":
        event.preventDefault();
        focusIndex(TAB_IDS.length - 1);
        break;
    }
  }

  return (
    <div
      role="tablist"
      aria-label="Command tabs"
      className="flex h-9 items-stretch overflow-x-auto border-b border-border bg-surface-muted px-2 lg:h-[52px] lg:gap-1 lg:px-4"
    >
      {TAB_IDS.map((tab, index) => {
        const isActive = tab === activeTab;
        return (
          <button
            key={tab}
            ref={(node) => {
              buttonRefs.current[index] = node;
            }}
            type="button"
            role="tab"
            id={`tab-${tab}`}
            aria-selected={isActive}
            aria-controls={`tabpanel-${tab}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onSelect(tab)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={
              "shrink-0 whitespace-nowrap px-3 text-xs font-medium tracking-wide transition-colors " +
              "lg:px-5 lg:text-[15px] lg:font-semibold lg:tracking-normal " +
              (isActive
                ? "border-b-2 border-accent text-text lg:border-b-[3px]"
                : "border-b-2 border-transparent text-text-muted hover:text-text lg:border-b-[3px]")
            }
          >
            {tab}
          </button>
        );
      })}
    </div>
  );
}
