import AppHeader from "../components/layout/AppHeader";
import OpenDocumentDialog from "../components/dialogs/OpenDocumentDialog";
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
    </WorkspaceProviders>
  );
}
