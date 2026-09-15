import { useState } from "react";
import CommandGroup from "./CommandGroup";
import CommandTabs, { type CommandTab } from "./CommandTabs";

export default function CommandRibbon() {
  const [activeTab, setActiveTab] = useState<CommandTab>("HOME");

  return (
    <div className="shrink-0 bg-white">
      <CommandTabs activeTab={activeTab} onSelect={setActiveTab} />
      <CommandGroup activeTab={activeTab} />
    </div>
  );
}
