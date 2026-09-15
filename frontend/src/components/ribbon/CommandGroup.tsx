import { useMemo } from "react";
import { commandsForTab } from "../../commands/registry";
import type { Command, TabId } from "../../commands/types";
import { BREAKPOINTS, useMediaQuery } from "../../hooks/useMediaQuery";
import DropdownMenu from "../ui/DropdownMenu";
import IconButton from "../ui/IconButton";
import CommandButton from "./CommandButton";

interface CommandGroupProps {
  activeTab: TabId;
  /** Real handlers for commands whose status is "available" but whose
   * behavior depends on state owned above this component (VIEW's zoom/fit
   * controls, wired by CommandRibbon from useDocumentViewState). */
  runHandlers?: Record<string, () => void>;
  /** Per-command reason an otherwise-implemented command is temporarily
   * inert due to current app state (e.g. no document open). */
  disabledReasons?: Record<string, string>;
}

function groupBy(commands: Command[]): Map<string, Command[]> {
  const map = new Map<string, Command[]>();
  for (const command of commands) {
    const list = map.get(command.group) ?? [];
    list.push(command);
    map.set(command.group, list);
  }
  return map;
}

/** Renders the active tab's command groups — the ribbon's "primary visual
 * commands" layer — from the command registry, with a narrower-viewport
 * overflow mode that collapses less-critical commands per group into a
 * "More" dropdown instead of shrinking everything illegibly. */
export default function CommandGroup({
  activeTab,
  runHandlers = {},
  disabledReasons = {},
}: CommandGroupProps) {
  const isCompact = useMediaQuery(BREAKPOINTS.tablet);
  const visibleCap = isCompact ? 3 : 6;

  const groups = useMemo(() => groupBy(commandsForTab(activeTab)), [activeTab]);

  if (groups.size === 0) {
    return (
      <div className="flex h-16 items-center px-4 text-xs text-text-subtle lg:min-h-[112px] lg:h-auto lg:px-5 lg:text-sm">
        No commands defined for {activeTab} yet.
      </div>
    );
  }

  return (
    <div
      role="tabpanel"
      id={`tabpanel-${activeTab}`}
      aria-labelledby={`tab-${activeTab}`}
      className="flex h-16 items-stretch gap-4 overflow-x-auto px-3 py-1.5 lg:h-auto lg:min-h-[112px] lg:gap-8 lg:px-5 lg:py-4"
    >
      {Array.from(groups.entries()).map(([groupName, commands]) => {
        const visible = commands.slice(0, visibleCap);
        const overflow = commands.slice(visibleCap);
        return (
          <div key={groupName} className="flex shrink-0 flex-col items-stretch">
            <div className="flex flex-1 items-start gap-1 lg:gap-2">
              {visible.map((command) => (
                <CommandButton
                  key={command.id}
                  command={command}
                  onRun={runHandlers[command.id]}
                  disabledReason={disabledReasons[command.id]}
                />
              ))}
              {overflow.length > 0 && (
                <DropdownMenu
                  items={overflow.map((command) => ({
                    id: command.id,
                    label: command.label,
                    disabled: command.status !== "available",
                    disabledHint: command.status === "available" ? undefined : "Not yet available",
                    onSelect: runHandlers[command.id] ?? command.run,
                  }))}
                  renderTrigger={(triggerProps) => (
                    <IconButton {...triggerProps} icon="more" label={`More ${groupName} commands`} />
                  )}
                />
              )}
            </div>
            <span className="mt-1 border-t border-border pt-1 text-center text-[10px] uppercase tracking-wide text-text-subtle lg:mt-1.5 lg:pt-1.5 lg:text-xs">
              {groupName}
            </span>
          </div>
        );
      })}
    </div>
  );
}
