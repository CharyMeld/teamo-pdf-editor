import { getCommand } from "../../commands/registry";
import CommandButton from "../ribbon/CommandButton";
import EmptyState from "../ui/EmptyState";

/** CENTER pane: the document canvas viewport. Phase 1 ships only the
 * scrollable/zoomable container and an honest empty state — Phase 2's
 * pdf.js rendering mounts inside `.canvas-viewport` once RENDER is
 * implemented (see ARCHITECTURE.md's document lifecycle). The "Open"
 * affordance below is the real `home.open` registry command, so it
 * honestly shows as unavailable rather than pretending to work. */
export default function PdfCanvas() {
  const openCommand = getCommand("home.open");

  return (
    <main className="canvas-viewport flex flex-1 items-center justify-center overflow-auto bg-bg">
      <EmptyState
        icon="document"
        title="No document open"
        description="Open a PDF to begin working in the canvas."
        action={openCommand && <CommandButton command={openCommand} compact />}
      />
    </main>
  );
}
