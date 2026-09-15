import { commandsForTab } from "../../commands/registry";
import type { TabId } from "../../commands/types";
import IconButton from "../ui/IconButton";
import CommandButton from "./CommandButton";

interface MobileCommandSheetProps {
  activeTab: TabId;
  open: boolean;
  onClose: () => void;
  runHandlers: Record<string, () => void>;
}

/**
 * The mobile-only compact command system: the active tab's commands as a
 * condensed action sheet rather than a horizontally-scrolling shrunken
 * ribbon. This is a genuinely different layout/interaction, not the
 * desktop ribbon scaled down.
 */
export default function MobileCommandSheet({
  activeTab,
  open,
  onClose,
  runHandlers,
}: MobileCommandSheetProps) {
  if (!open) return null;
  const commands = commandsForTab(activeTab);

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end bg-black/30" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${activeTab} commands`}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[60vh] overflow-y-auto rounded-t-xl border-t border-border bg-surface p-2 shadow-lg"
      >
        <div className="mb-1 flex items-center justify-between px-2 py-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-text-subtle">
            {activeTab}
          </span>
          <IconButton icon="close" label="Close commands" onClick={onClose} size="sm" />
        </div>
        <div className="flex flex-col gap-0.5">
          {commands.length === 0 && (
            <p className="px-2 py-3 text-xs text-text-subtle">No commands defined for {activeTab} yet.</p>
          )}
          {commands.map((command) => (
            <CommandButton key={command.id} command={command} compact onRun={runHandlers[command.id]} />
          ))}
        </div>
      </div>
    </div>
  );
}
