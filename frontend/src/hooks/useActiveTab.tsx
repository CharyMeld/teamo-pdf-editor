import { createContext, useContext, useState, type ReactNode } from "react";
import type { TabId } from "../commands/types";

interface ActiveTabContextValue {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
}

const ActiveTabContext = createContext<ActiveTabContextValue | null>(null);

/** Shared active-ribbon-tab state — read by the ribbon, and by the Smart
 * Inspector so its contextual panels can match the active tab. */
export function ActiveTabProvider({ children }: { children: ReactNode }) {
  const [activeTab, setActiveTab] = useState<TabId>("HOME");
  return (
    <ActiveTabContext.Provider value={{ activeTab, setActiveTab }}>
      {children}
    </ActiveTabContext.Provider>
  );
}

export function useActiveTab(): ActiveTabContextValue {
  const ctx = useContext(ActiveTabContext);
  if (!ctx) {
    throw new Error("useActiveTab must be used within an ActiveTabProvider");
  }
  return ctx;
}
