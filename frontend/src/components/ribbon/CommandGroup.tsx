import type { CommandTab } from "./CommandTabs";

interface CommandGroupProps {
  activeTab: CommandTab;
}

// Populated per-tab by future phases (e.g. HOME's upload/save controls,
// OCR's run-OCR control). Phase 0 intentionally renders no commands.
export default function CommandGroup({ activeTab }: CommandGroupProps) {
  return (
    <div className="flex h-14 items-center px-4 text-xs text-slate-400">
      {activeTab} commands — not yet implemented
    </div>
  );
}
