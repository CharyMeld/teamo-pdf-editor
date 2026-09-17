import type { ReactNode } from "react";
import { SelectionProvider } from "../commands/useSelectionContext";
import { ContentObjectsProvider } from "../content-editor/useContentObjects";
import { ActiveTabProvider } from "../hooks/useActiveTab";
import { DocumentViewProvider } from "../hooks/useDocumentViewState";
import { OpenDocumentProvider } from "../hooks/useOpenDocument";
import { PageSelectionProvider } from "../hooks/usePageSelection";
import { PanelVisibilityProvider } from "../hooks/usePanelVisibility";
import { WorkingDocumentProvider } from "../hooks/useWorkingDocument";

/** Composes the workspace's shared state providers in one place so
 * WorkspacePage doesn't accumulate a growing pyramid of wrappers as more
 * are added in later phases. OpenDocumentProvider sits inside
 * DocumentViewProvider because it drives that hook's setters (see
 * useOpenDocument's docblock). WorkingDocumentProvider (Phase 3) sits
 * inside OpenDocumentProvider for the same reason — it needs the open
 * document's id/status; PageSelectionProvider sits inside that because it
 * clears selection on both a document change and a working-copy mutation
 * (see usePageSelection's docblock). */
export default function WorkspaceProviders({ children }: { children: ReactNode }) {
  return (
    <ActiveTabProvider>
      <SelectionProvider>
        <DocumentViewProvider>
          <OpenDocumentProvider>
            <WorkingDocumentProvider>
              <ContentObjectsProvider>
                <PageSelectionProvider>
                  <PanelVisibilityProvider>{children}</PanelVisibilityProvider>
                </PageSelectionProvider>
              </ContentObjectsProvider>
            </WorkingDocumentProvider>
          </OpenDocumentProvider>
        </DocumentViewProvider>
      </SelectionProvider>
    </ActiveTabProvider>
  );
}
