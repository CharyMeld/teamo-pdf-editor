import { getCommand } from "../../commands/registry";
import PasswordPrompt from "../dialogs/PasswordPrompt";
import { useOpenDocument } from "../../hooks/useOpenDocument";
import CommandButton from "../ribbon/CommandButton";
import EmptyState from "../ui/EmptyState";
import Spinner from "../ui/Spinner";
import PdfViewer from "./PdfViewer";

/** CENTER pane: the document canvas viewport. Which of these renders is
 * driven entirely by the real document lifecycle (useOpenDocument) — no
 * document → honest empty state, locked → a real password prompt,
 * processing → a real (non-fake) progress indicator, ready → the actual
 * pdf.js-rendered PDF (PdfViewer), failed → a real error state. */
export default function PdfCanvas() {
  const openCommand = getCommand("home.open");
  const { document: doc, pdfDoc, pdfLoadError, showOpenDialog } = useOpenDocument();

  if (!doc) {
    return (
      <main className="canvas-viewport flex flex-1 items-center justify-center overflow-auto bg-bg">
        <EmptyState
          icon="document"
          title="No document open"
          description="Open a PDF to begin working in the canvas."
          action={openCommand && <CommandButton command={openCommand} onRun={showOpenDialog} compact />}
        />
      </main>
    );
  }

  if (doc.status === "password_protected") {
    return (
      <main className="canvas-viewport flex flex-1 items-center justify-center overflow-auto bg-bg">
        <PasswordPrompt />
      </main>
    );
  }

  if (doc.status === "failed") {
    return (
      <main className="canvas-viewport flex flex-1 items-center justify-center overflow-auto bg-bg">
        <EmptyState
          icon="close"
          title="This document could not be processed"
          description="The file may be corrupted or in an unsupported format. Try opening a different document."
        />
      </main>
    );
  }

  if (pdfLoadError) {
    return (
      <main className="canvas-viewport flex flex-1 items-center justify-center overflow-auto bg-bg">
        <EmptyState icon="close" title="This document could not be rendered" description={pdfLoadError} />
      </main>
    );
  }

  if (doc.status !== "ready" || !pdfDoc) {
    return (
      <main className="canvas-viewport flex flex-1 items-center justify-center overflow-auto bg-bg">
        <div className="flex flex-col items-center gap-2">
          <Spinner size={20} label="Processing document" />
          <p className="text-xs text-text-muted">Processing document…</p>
        </div>
      </main>
    );
  }

  return <PdfViewer />;
}
