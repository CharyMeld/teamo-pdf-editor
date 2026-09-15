import * as pdfjsLib from "pdfjs-dist";

// Vite-native worker resolution — no manual copy step, no CDN. This is the
// only place pdf.js is configured; PdfViewer and useOpenDocument both
// import from here so there is exactly one worker instance.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export { pdfjsLib };
export type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";

export interface LoadPdfOptions {
  url: string;
  password?: string;
}

/**
 * Loads a PDF document over the authenticated backend stream
 * (GET /api/documents/{id}/file — Range-request capable, see
 * ARCHITECTURE.md's Phase 2 section). `withCredentials: true` is required
 * because the frontend and backend are different origins in development;
 * the session cookie set by /api/dev/login must ride along.
 */
export function loadPdfDocument({ url, password }: LoadPdfOptions) {
  return pdfjsLib.getDocument({
    url,
    withCredentials: true,
    password,
  });
}
