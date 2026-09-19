import type { DocumentLifecycleState, DocumentStatus } from "./api";

export interface StatusPresentation {
  label: string;
  tone: "success" | "warning" | "danger" | "loading" | "neutral";
}

export function presentDocumentStatus(status: DocumentStatus): StatusPresentation {
  switch (status) {
    case "ready":
      return { label: "Ready", tone: "success" };
    case "processing":
    case "uploading":
    case "validating":
      return { label: "Processing…", tone: "loading" };
    case "password_protected":
      return { label: "Password protected", tone: "warning" };
    case "failed":
      return { label: "Failed", tone: "danger" };
    case "archived":
      return { label: "Archived", tone: "neutral" };
    default:
      return { label: status, tone: "neutral" };
  }
}

/** Phase 13: presents `lifecycleState`, a genuinely different concept
 * from `status` above (edit/save history vs. ingest/processing) — kept
 * as its own function rather than folded into `presentDocumentStatus`
 * so the two never get conflated at a call site. */
export function presentLifecycleState(state: DocumentLifecycleState): StatusPresentation {
  switch (state) {
    case "original":
      return { label: "Original", tone: "neutral" };
    case "working":
      return { label: "Working (unsaved changes)", tone: "warning" };
    case "saved":
      return { label: "Saved", tone: "success" };
    case "processing":
      return { label: "Processing…", tone: "loading" };
    case "failed":
      return { label: "Failed", tone: "danger" };
    case "archived":
      return { label: "Archived", tone: "neutral" };
    case "password_protected":
      return { label: "Password protected", tone: "warning" };
    default:
      return { label: state, tone: "neutral" };
  }
}
