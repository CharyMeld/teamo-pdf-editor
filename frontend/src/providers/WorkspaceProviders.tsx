import type { ReactNode } from "react";
import { AnnotationsProvider } from "../annotations/useAnnotations";
import { SelectionProvider } from "../commands/useSelectionContext";
import { ContentObjectsProvider } from "../content-editor/useContentObjects";
import { ActiveTabProvider } from "../hooks/useActiveTab";
import { DocumentViewProvider } from "../hooks/useDocumentViewState";
import { OpenDocumentProvider } from "../hooks/useOpenDocument";
import { PageSelectionProvider } from "../hooks/usePageSelection";
import { PanelVisibilityProvider } from "../hooks/usePanelVisibility";
import { WorkingDocumentProvider } from "../hooks/useWorkingDocument";
import { ScanWorkflowProvider } from "../scanning/useScanWorkflow";

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
      {/* No dependency on any other provider here (Phase 6's scan/import
          workflow creates a brand-new document, independent of whatever is
          currently open) — placement outside the rest is arbitrary, not
          load-bearing. */}
      <ScanWorkflowProvider>
        <SelectionProvider>
          <DocumentViewProvider>
            <OpenDocumentProvider>
              <WorkingDocumentProvider>
                <ContentObjectsProvider>
                  <AnnotationsProvider>
                    <PageSelectionProvider>
                      <PanelVisibilityProvider>{children}</PanelVisibilityProvider>
                    </PageSelectionProvider>
                  </AnnotationsProvider>
                </ContentObjectsProvider>
              </WorkingDocumentProvider>
            </OpenDocumentProvider>
          </DocumentViewProvider>
        </SelectionProvider>
      </ScanWorkflowProvider>
    </ActiveTabProvider>
  );
}
