import AppHeader from "../components/layout/AppHeader";
import AiSettingsDialog from "../components/dialogs/AiSettingsDialog";
import CompressDialog from "../components/dialogs/CompressDialog";
import CreatePdfFromImagesDialog from "../components/dialogs/CreatePdfFromImagesDialog";
import CropDialog from "../components/dialogs/CropDialog";
import ExportDialog from "../components/dialogs/ExportDialog";
import InsertPageDialog from "../components/dialogs/InsertPageDialog";
import MergeDialog from "../components/dialogs/MergeDialog";
import OcrResultsPanel from "../components/dialogs/OcrResultsPanel";
import OfficeToPdfDialog from "../components/dialogs/OfficeToPdfDialog";
import OpenDocumentDialog from "../components/dialogs/OpenDocumentDialog";
import DocumentPropertiesDialog from "../components/dialogs/DocumentPropertiesDialog";
import RecentDocumentsDialog from "../components/dialogs/RecentDocumentsDialog";
import ReplacePageDialog from "../components/dialogs/ReplacePageDialog";
import RunOcrDialog from "../components/dialogs/RunOcrDialog";
import SaveAsDialog from "../components/dialogs/SaveAsDialog";
import SplitDialog from "../components/dialogs/SplitDialog";
import CommandRibbon from "../components/ribbon/CommandRibbon";
import DocumentWorkspace from "../components/workspace/DocumentWorkspace";
import StatusBar from "../components/workspace/StatusBar";
import WorkspaceProviders from "../providers/WorkspaceProviders";

export default function WorkspacePage() {
  return (
    <WorkspaceProviders>
      <div className="flex h-full min-h-0 flex-col bg-bg">
        <AppHeader />
        <CommandRibbon />
        <DocumentWorkspace />
        <StatusBar />
      </div>
      <OpenDocumentDialog />
      <InsertPageDialog />
      <ReplacePageDialog />
      <MergeDialog />
      <SplitDialog />
      <SaveAsDialog />
      <CropDialog />
      <CreatePdfFromImagesDialog />
      <RunOcrDialog />
      <OcrResultsPanel />
      <ExportDialog />
      <OfficeToPdfDialog />
      <CompressDialog />
      <AiSettingsDialog />
      <RecentDocumentsDialog />
      <DocumentPropertiesDialog />
    </WorkspaceProviders>
  );
}
