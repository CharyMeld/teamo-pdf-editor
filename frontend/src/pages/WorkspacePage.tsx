import AppHeader from "../components/layout/AppHeader";
import CropDialog from "../components/dialogs/CropDialog";
import InsertPageDialog from "../components/dialogs/InsertPageDialog";
import MergeDialog from "../components/dialogs/MergeDialog";
import OpenDocumentDialog from "../components/dialogs/OpenDocumentDialog";
import ReplacePageDialog from "../components/dialogs/ReplacePageDialog";
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
    </WorkspaceProviders>
  );
}
