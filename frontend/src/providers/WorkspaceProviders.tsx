import type { ReactNode } from "react";
import { SelectionProvider } from "../commands/useSelectionContext";
import { ActiveTabProvider } from "../hooks/useActiveTab";
import { DocumentViewProvider } from "../hooks/useDocumentViewState";
import { OpenDocumentProvider } from "../hooks/useOpenDocument";
import { PanelVisibilityProvider } from "../hooks/usePanelVisibility";

/** Composes the workspace's shared state providers in one place so
 * WorkspacePage doesn't accumulate a growing pyramid of wrappers as more
 * are added in later phases. OpenDocumentProvider sits inside
 * DocumentViewProvider because it drives that hook's setters (see
 * useOpenDocument's docblock). */
export default function WorkspaceProviders({ children }: { children: ReactNode }) {
  return (
    <ActiveTabProvider>
      <SelectionProvider>
        <DocumentViewProvider>
          <OpenDocumentProvider>
            <PanelVisibilityProvider>{children}</PanelVisibilityProvider>
          </OpenDocumentProvider>
        </DocumentViewProvider>
      </SelectionProvider>
    </ActiveTabProvider>
  );
}
