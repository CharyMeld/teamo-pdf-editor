import { useAnnotations } from "../annotations/useAnnotations";
import { useContentObjects } from "../content-editor/useContentObjects";
import { useOpenDocument } from "./useOpenDocument";
import { useWorkingDocument } from "./useWorkingDocument";

interface SignatureRunHandlers {
  runHandlers: Record<string, () => void>;
  disabledReasons: Record<string, string>;
}

/**
 * Real `run`/`disabledReason` maps for SIGN's three signature-creation
 * commands. Per Phase 11's core finding, a placed signature is not a new
 * kind of object — it's an existing Phase 4 text/image object or Phase 5
 * freehand annotation, so these commands just arm the *same* placement
 * mechanisms those phases already built, with `signatureDefaults: true` so
 * the resulting object is flagged `isSignature` (see ContentObjectLayer's
 * and AnnotationLayer's matching `isActiveLayer` comments for how the
 * canvas layers recognize SIGN as a valid active tab for these specific
 * placement modes). Move/Resize/Delete need no wiring here at all — they're
 * the existing content-object/annotation panels' existing functionality.
 */
export function useSignatureRunHandlers(): SignatureRunHandlers {
  const { document: doc } = useOpenDocument();
  const working = useWorkingDocument();
  const content = useContentObjects();
  const annotations = useAnnotations();

  const documentReady = !!doc && doc.status === "ready";

  const runHandlers: Record<string, () => void> = {
    "sign.draw": () => annotations.startPlacing("freehand", { signatureDefaults: true }),
    "sign.type": () => content.startPlacing("text", { signatureDefaults: true }),
    "sign.upload": () => content.startPlacing("image", { signatureDefaults: true }),
  };

  const disabledReasons: Record<string, string> = {};
  for (const id of ["sign.draw", "sign.type", "sign.upload"]) {
    if (!documentReady) disabledReasons[id] = "No document open";
    else if (working.busy) disabledReasons[id] = working.busyLabel ?? "An operation is in progress…";
  }

  return { runHandlers, disabledReasons };
}
