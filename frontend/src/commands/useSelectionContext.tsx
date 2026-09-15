import { createContext, useContext, useState, type ReactNode } from "react";
import type { SelectionType } from "./types";

interface SelectionContextValue {
  selection: SelectionType;
  setSelection: (selection: SelectionType) => void;
}

const SelectionContext = createContext<SelectionContextValue | null>(null);

/**
 * Holds the current selection type (none / page / text / image / annotation)
 * so the ribbon and Smart Inspector can react to it. In Phase 1 there is no
 * real PDF canvas to select content from yet, so this is driven by a
 * dev-only simulator (see DevSelectionSimulator) — the state and the
 * components reacting to it are real; only the *source* of the change is a
 * stand-in for real canvas interaction, which a later phase adds.
 */
export function SelectionProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<SelectionType>("none");
  return (
    <SelectionContext.Provider value={{ selection, setSelection }}>
      {children}
    </SelectionContext.Provider>
  );
}

export function useSelectionContext(): SelectionContextValue {
  const ctx = useContext(SelectionContext);
  if (!ctx) {
    throw new Error("useSelectionContext must be used within a SelectionProvider");
  }
  return ctx;
}
