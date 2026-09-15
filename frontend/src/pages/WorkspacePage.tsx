import AppHeader from "../components/layout/AppHeader";
import CommandRibbon from "../components/ribbon/CommandRibbon";
import DocumentWorkspace from "../components/workspace/DocumentWorkspace";
import StatusBar from "../components/workspace/StatusBar";

export default function WorkspacePage() {
  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-100">
      <AppHeader />
      <CommandRibbon />
      <DocumentWorkspace />
      <StatusBar />
    </div>
  );
}
