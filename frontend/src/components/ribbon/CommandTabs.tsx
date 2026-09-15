export const COMMAND_TABS = [
  "HOME",
  "EDIT",
  "VIEW",
  "ORGANIZE",
  "ANNOTATE",
  "FORMS",
  "OCR",
  "CONVERT",
  "COMPRESS",
  "SIGN",
  "AI",
  "HELP",
] as const;

export type CommandTab = (typeof COMMAND_TABS)[number];

interface CommandTabsProps {
  activeTab: CommandTab;
  onSelect: (tab: CommandTab) => void;
}

export default function CommandTabs({ activeTab, onSelect }: CommandTabsProps) {
  return (
    <div className="flex h-9 items-stretch border-b border-slate-200 bg-slate-50 px-2">
      {COMMAND_TABS.map((tab) => {
        const isActive = tab === activeTab;
        return (
          <button
            key={tab}
            type="button"
            onClick={() => onSelect(tab)}
            className={
              "px-3 text-xs font-medium tracking-wide transition-colors " +
              (isActive
                ? "border-b-2 border-slate-900 text-slate-900"
                : "border-b-2 border-transparent text-slate-500 hover:text-slate-800")
            }
          >
            {tab}
          </button>
        );
      })}
    </div>
  );
}
