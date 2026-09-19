import { CONTEXTUAL_COMMANDS } from "../../commands/registry";
import type { SelectionType } from "../../commands/types";
import CommandButton from "./CommandButton";

interface ContextualCommandGroupProps {
  selection: Exclude<SelectionType, "none">;
  /** Real handlers for contextual commands whose behavior depends on
   * state owned above this component — e.g. "page" selected wires to
   * useOrganizeRunHandlers (Phase 3). Commands with no entry here fall
   * back to their own `command.run`, same as CommandButton's default. */
  runHandlers?: Record<string, () => void>;
  disabledReasons?: Record<string, string>;
}

/** The ribbon's contextual layer: an extra, visually distinct group that
 * only appears while something is selected, sourced from
 * CONTEXTUAL_COMMANDS[selection]. This is what makes "page selected → page
 * commands, text selected → text commands, ..." real rather than a static
 * mock. */
export default function ContextualCommandGroup({
  selection,
  runHandlers = {},
  disabledReasons = {},
}: ContextualCommandGroupProps) {
  const commands = CONTEXTUAL_COMMANDS[selection];
  const label = `${selection.charAt(0).toUpperCase()}${selection.slice(1)} Selected`;

  return (
    <div className="flex h-16 shrink-0 items-stretch gap-1 border-l-2 border-accent bg-accent-subtle/40 px-3 py-1.5 lg:h-auto lg:min-h-[112px] lg:px-5 lg:py-4">
      <div className="flex flex-col items-stretch">
        <div className="flex flex-1 items-start gap-1 lg:gap-2">
          {commands.map((command) => (
            <CommandButton
              key={command.id}
              command={command}
              onRun={runHandlers[command.id]}
              runHandlers={runHandlers}
              disabledReason={disabledReasons[command.id]}
            />
          ))}
        </div>
        <span className="mt-1 border-t border-accent/30 pt-1 text-center text-[10px] uppercase tracking-wide text-accent-subtle-text lg:mt-1.5 lg:pt-1.5 lg:text-xs">
          {label}
        </span>
      </div>
    </div>
  );
}
