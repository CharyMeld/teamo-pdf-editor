import type { DocumentStatus } from "./api";

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
