import { useMemo } from "react";
import { REGISTRY } from "./registry";
import type { Command } from "./types";

function matches(command: Command, needle: string): boolean {
  if (command.label.toLowerCase().includes(needle)) return true;
  if (command.description?.toLowerCase().includes(needle)) return true;
  return command.keywords.some((k) => k.toLowerCase().includes(needle));
}

/**
 * Real substring search over the command registry (label, description,
 * keywords) plus each command's dropdown sub-commands. "compress" finds the
 * Compress tab's commands; "ocr" finds the OCR tab's commands.
 */
export function searchCommands(query: string): Command[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  const results: Command[] = [];
  for (const command of REGISTRY) {
    if (matches(command, needle)) results.push(command);
    if (command.dropdown) {
      for (const sub of command.dropdown) {
        if (matches(sub, needle)) results.push(sub);
      }
    }
  }
  return results;
}

export function useCommandSearch(query: string): Command[] {
  return useMemo(() => searchCommands(query), [query]);
}
