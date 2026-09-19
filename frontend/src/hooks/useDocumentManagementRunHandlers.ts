import { useDocumentLibrary } from "../documents/useDocumentLibrary";
import { useOpenDocument } from "./useOpenDocument";

interface DocumentManagementRunHandlers {
  runHandlers: Record<string, () => void>;
  disabledReasons: Record<string, string>;
}

/**
 * Phase 13 (document management): real `run`/`disabledReason` maps
 * for HOME's Recent Documents / Document Properties / Close commands
 * — the same shape every other `use*RunHandlers` hook in this app
 * already establishes. `home.close` just calls the *already-built*
 * `useOpenDocument().closeDocument()` — see that hook's docblock;
 * this phase only needed to flip the registry entry and wire it.
 */
export function useDocumentManagementRunHandlers(): DocumentManagementRunHandlers {
  const { document: doc, closeDocument } = useOpenDocument();
  const library = useDocumentLibrary();

  const documentReady = !!doc;

  const runHandlers: Record<string, () => void> = {
    "home.recent": library.openDialog,
    "home.properties": library.openProperties,
    "home.close": closeDocument,
  };

  const disabledReasons: Record<string, string> = {};
  if (!documentReady) {
    disabledReasons["home.properties"] = "No document open";
    disabledReasons["home.close"] = "No document open";
  }

  return { runHandlers, disabledReasons };
}
