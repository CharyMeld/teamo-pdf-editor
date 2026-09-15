import { CONTEXTUAL_COMMANDS } from "../../commands/registry";
import type { SelectionType } from "../../commands/types";
import CommandButton from "./CommandButton";

interface ContextualCommandGroupProps {
  selection: Exclude<SelectionType, "none">;
}

/** The ribbon's contextual layer: an extra, visually distinct group that
 * only appears while something is selected, sourced from
 * CONTEXTUAL_COMMANDS[selection]. This is what makes "page selected → page
 * commands, text selected → text commands, ..." real rather than a static
 * mock. */
export default function ContextualCommandGroup({ selection }: ContextualCommandGroupProps) {
  const commands = CONTEXTUAL_COMMANDS[selection];
  const label = `${selection.charAt(0).toUpperCase()}${selection.slice(1)} Selected`;

  return (
    <div className="flex h-16 shrink-0 items-stretch gap-1 border-l-2 border-accent bg-accent-subtle/40 px-3 py-1.5">
      <div className="flex flex-col items-stretch">
        <div className="flex flex-1 items-start gap-1">
          {commands.map((command) => (
            <CommandButton key={command.id} command={command} />
          ))}
        </div>
        <span className="mt-1 border-t border-accent/30 pt-1 text-center text-[10px] uppercase tracking-wide text-accent-subtle-text">
          {label}
        </span>
      </div>
    </div>
  );
}
