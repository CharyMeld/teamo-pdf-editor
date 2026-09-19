import type { ReactNode } from "react";
import { AiSettingsProvider } from "../ai/useAiSettings";
import { AnnotationsProvider } from "../annotations/useAnnotations";
import { SelectionProvider } from "../commands/useSelectionContext";
import { ContentObjectsProvider } from "../content-editor/useContentObjects";
import { FormFieldsProvider } from "../forms/useFormFields";
import { ActiveTabProvider } from "../hooks/useActiveTab";
import { DocumentViewProvider } from "../hooks/useDocumentViewState";
import { OpenDocumentProvider } from "../hooks/useOpenDocument";
import { PageSelectionProvider } from "../hooks/usePageSelection";
import { PanelVisibilityProvider } from "../hooks/usePanelVisibility";
import { WorkingDocumentProvider } from "../hooks/useWorkingDocument";
import { CompressionWorkflowProvider } from "../compression/useCompressionWorkflow";
import { ConversionWorkflowProvider } from "../conversion/useConversionWorkflow";
import { DocumentLibraryProvider } from "../documents/useDocumentLibrary";
import { OcrWorkflowProvider } from "../ocr/useOcrWorkflow";
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
    // Phase 12.3 (AI settings) and Phase 13 (document library): both
    // account-level, not document-scoped — no dependency on anything
    // else in this tree, so they sit outermost, alongside
    // ScanWorkflowProvider's own "no dependency" reasoning.
    <AiSettingsProvider>
      <DocumentLibraryProvider>
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
                        {/* Phase 10 (forms): a third, independent sibling
                            chain to content objects/annotations above — same
                            dependency shape (open document, working copy,
                            selection). */}
                        <FormFieldsProvider>
                          <PageSelectionProvider>
                            {/* Phase 7 (OCR): needs the open document, working
                                copy (applyOperationResult), and page selection —
                                sits inside all three for that reason. */}
                            <OcrWorkflowProvider>
                              {/* Phase 8 (conversion): same dependency shape as
                                  OCR — the open document, working copy
                                  (pageCount), and page selection (images-format
                                  scope). */}
                              <ConversionWorkflowProvider>
                                {/* Phase 9 (compression): only needs the open
                                    document + working copy (applyOperationResult
                                    for "replace") — no page selection. */}
                                <CompressionWorkflowProvider>
                                  <PanelVisibilityProvider>{children}</PanelVisibilityProvider>
                                </CompressionWorkflowProvider>
                              </ConversionWorkflowProvider>
                            </OcrWorkflowProvider>
                          </PageSelectionProvider>
                        </FormFieldsProvider>
                      </AnnotationsProvider>
                    </ContentObjectsProvider>
                  </WorkingDocumentProvider>
                </OpenDocumentProvider>
              </DocumentViewProvider>
            </SelectionProvider>
          </ScanWorkflowProvider>
        </ActiveTabProvider>
      </DocumentLibraryProvider>
    </AiSettingsProvider>
  );
}
