import type { ReactNode } from "react";
import { SelectionProvider } from "../commands/useSelectionContext";
import { ActiveTabProvider } from "../hooks/useActiveTab";
import { DocumentViewProvider } from "../hooks/useDocumentViewState";
import { PanelVisibilityProvider } from "../hooks/usePanelVisibility";

/** Composes the workspace's shared state providers in one place so
 * WorkspacePage doesn't accumulate a growing pyramid of wrappers as more
 * are added in later phases. */
export default function WorkspaceProviders({ children }: { children: ReactNode }) {
  return (
    <ActiveTabProvider>
      <SelectionProvider>
        <DocumentViewProvider>
          <PanelVisibilityProvider>{children}</PanelVisibilityProvider>
        </DocumentViewProvider>
      </SelectionProvider>
    </ActiveTabProvider>
  );
}
