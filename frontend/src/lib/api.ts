import axios from "axios";

// The frontend is a thin client: it talks to the backend exclusively
// through this REST client. No PDF processing, storage, or business
// logic lives here — see ARCHITECTURE.md's API/service boundary rule.
// `withXSRFToken` is required (not just `withCredentials`) because the
// frontend (5173) and backend (8000) are different origins in
// development — axios only auto-attaches the XSRF header to same-origin
// requests unless this is set.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api";
const API_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, "");

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  withXSRFToken: true,
});

export default api;

export interface HealthResponse {
  status: string;
  app: string;
  time: string;
}

export async function checkHealth(): Promise<HealthResponse> {
  const { data } = await api.get<HealthResponse>("/health");
  return data;
}

/**
 * LOCAL-DEVELOPMENT-ONLY auto-auth bootstrap — see
 * backend/app/Http/Controllers/Api/DevAuthController.php and
 * ARCHITECTURE.md's Phase 2 section. Fetches the Sanctum CSRF cookie, then
 * establishes a real session for the single seeded dev user. There is no
 * login UI yet (deferred by design), but the session this creates is a
 * real one, not a mock.
 */
export async function ensureDevSession(): Promise<void> {
  await axios.get(`${API_ORIGIN}/sanctum/csrf-cookie`, { withCredentials: true });
  await api.post("/dev/login");
}

export type DocumentStatus =
  | "uploading"
  | "validating"
  | "processing"
  | "ready"
  | "password_protected"
  | "failed"
  | "archived";

export interface DocumentSummary {
  id: string;
  title: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  status: DocumentStatus;
  pageCount: number | null;
  createdAt: string;
}

export interface DocumentPageMeta {
  pageNumber: number;
  widthPt: number;
  heightPt: number;
  rotationDegrees: number;
  thumbnailReady: boolean;
}

export async function listDocuments(): Promise<DocumentSummary[]> {
  const { data } = await api.get<{ data: DocumentSummary[] }>("/documents");
  return data.data;
}

export async function uploadDocument(file: File): Promise<DocumentSummary> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<DocumentSummary>("/documents", form);
  return data;
}

/** Opens a document — records `document.opened` server-side (see
 * DocumentController::show). Call once when a document is first opened,
 * not on every poll tick (use getDocumentStatus for that). */
export async function getDocument(id: string): Promise<DocumentSummary> {
  const { data } = await api.get<DocumentSummary>(`/documents/${id}`);
  return data;
}

/** Lightweight polling — no audit log per call. */
export async function getDocumentStatus(id: string): Promise<DocumentSummary> {
  const { data } = await api.get<DocumentSummary>(`/documents/${id}/status`);
  return data;
}

export async function getDocumentPages(id: string): Promise<DocumentPageMeta[]> {
  const { data } = await api.get<{ data: DocumentPageMeta[] }>(`/documents/${id}/pages`);
  return data.data;
}

export async function unlockDocument(id: string, password: string): Promise<DocumentSummary> {
  const { data } = await api.post<DocumentSummary>(`/documents/${id}/unlock`, { password });
  return data;
}

/** URL pdf.js fetches directly (Range-request capable) — see lib/pdf.ts. */
export function documentFileUrl(id: string): string {
  return `${API_BASE_URL}/documents/${id}/file`;
}

/** URL for a real, pre-rendered page thumbnail — used with
 * `<img crossOrigin="use-credentials">` so the session cookie rides along
 * cross-origin. */
export function documentThumbnailUrl(id: string, pageNumber: number): string {
  return `${API_BASE_URL}/documents/${id}/pages/${pageNumber}/thumbnail`;
}

// ---------------------------------------------------------------------------
// Phase 3 — ORGANIZE: real page-management operations against the backend's
// qpdf/Ghostscript-backed engine and working-copy/undo-redo model (see
// ARCHITECTURE.md's Phase 3 (backend) section). Every function here calls a
// real endpoint; there is no client-side page manipulation anywhere.

export interface WorkingPageMeta {
  pageNumber: number;
  widthPt: number;
  heightPt: number;
  thumbnailReady: boolean;
}

export interface WorkingPagesResponse {
  pages: WorkingPageMeta[];
  source: "step" | "version";
  stepId: number | null;
  versionId: number | null;
  /** True while a working step's thumbnail/page-metadata job is still
   * running — `pages` is empty until it settles; poll again shortly. */
  pending: boolean;
}

export interface OperationResult {
  operationId: number;
  sequenceNumber: number;
  pageCount: number;
  thumbnailJobId: number;
  status: string;
  canUndo: boolean;
  canRedo: boolean;
}

export interface UndoRedoResult {
  pageCount: number;
  currentStepId: number | null;
  canUndo: boolean;
  canRedo: boolean;
}

export interface SaveResult {
  versionNumber: number;
  document: DocumentSummary;
}

/** The subset of document fields the operation endpoints that create new
 * documents (Save As, Extract, Split) return — narrower than
 * DocumentSummary. Callers that need the full record call getDocument(id). */
export interface NewDocumentRef {
  id: string;
  title: string;
  status: DocumentStatus;
  pageCount: number | null;
}

export async function getWorkingPages(id: string): Promise<WorkingPagesResponse> {
  const { data } = await api.get<{
    data: WorkingPageMeta[];
    source: "step" | "version";
    stepId?: number;
    versionId?: number;
    pending?: boolean;
  }>(`/documents/${id}/working/pages`);
  return {
    pages: data.data,
    source: data.source,
    stepId: data.stepId ?? null,
    versionId: data.versionId ?? null,
    pending: data.pending ?? false,
  };
}

/** URL for a real thumbnail of the *working* copy's current state — used
 * once a document has pending edits (working/pages' `source === "step"`);
 * falls back to documentThumbnailUrl for the unedited base version. */
export function workingThumbnailUrl(id: string, pageNumber: number): string {
  return `${API_BASE_URL}/documents/${id}/working/pages/${pageNumber}/thumbnail`;
}

async function postOperation(
  id: string,
  operation: string,
  body: Record<string, unknown>,
): Promise<OperationResult> {
  const { data } = await api.post<OperationResult>(`/documents/${id}/operations/${operation}`, body);
  return data;
}

async function postOperationMultipart(
  id: string,
  operation: string,
  fields: Record<string, string | number>,
  file: File,
): Promise<OperationResult> {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, String(value));
  form.append("file", file);
  const { data } = await api.post<OperationResult>(`/documents/${id}/operations/${operation}`, form);
  return data;
}

export function insertBlankPage(id: string, afterPage: number): Promise<OperationResult> {
  return postOperation(id, "insert", { afterPage, source: "blank" });
}

export function insertUploadedPage(id: string, afterPage: number, file: File): Promise<OperationResult> {
  return postOperationMultipart(id, "insert", { afterPage, source: "upload" }, file);
}

export function deletePages(id: string, pages: number[]): Promise<OperationResult> {
  return postOperation(id, "delete", { pages });
}

export function reorderPages(id: string, newOrder: number[]): Promise<OperationResult> {
  return postOperation(id, "reorder", { newOrder });
}

export function duplicatePages(id: string, pages: number[]): Promise<OperationResult> {
  return postOperation(id, "duplicate", { pages });
}

export function rotatePages(
  id: string,
  pages: number[],
  degrees: 90 | 180 | 270 | -90,
): Promise<OperationResult> {
  return postOperation(id, "rotate", { pages, degrees });
}

export interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function cropPages(id: string, pages: number[], box: CropBox): Promise<OperationResult> {
  return postOperation(id, "crop", { pages, box });
}

export function replacePage(
  id: string,
  page: number,
  file: File,
  replacementPage?: number,
): Promise<OperationResult> {
  return postOperationMultipart(
    id,
    "replace",
    replacementPage ? { page, replacementPage } : { page },
    file,
  );
}

export function mergeDocument(
  id: string,
  withDocumentId: string,
  position: "before" | "after",
): Promise<OperationResult> {
  return postOperation(id, "merge", { withDocumentId, position });
}

export async function extractPages(id: string, pages: number[]): Promise<NewDocumentRef> {
  const { data } = await api.post<{ data: NewDocumentRef }>(`/documents/${id}/operations/extract`, {
    pages,
  });
  return data.data;
}

export async function splitDocument(id: string, ranges: [number, number][]): Promise<NewDocumentRef[]> {
  const { data } = await api.post<{ data: NewDocumentRef[] }>(`/documents/${id}/operations/split`, {
    ranges,
  });
  return data.data;
}

export async function undoOperation(id: string): Promise<UndoRedoResult> {
  const { data } = await api.post<UndoRedoResult>(`/documents/${id}/undo`);
  return data;
}

export async function redoOperation(id: string): Promise<UndoRedoResult> {
  const { data } = await api.post<UndoRedoResult>(`/documents/${id}/redo`);
  return data;
}

export async function saveDocument(id: string): Promise<SaveResult> {
  const { data } = await api.post<SaveResult>(`/documents/${id}/save`);
  return data;
}

export async function saveDocumentAs(id: string, title: string): Promise<NewDocumentRef> {
  const { data } = await api.post<{ data: NewDocumentRef }>(`/documents/${id}/save-as`, { title });
  return data.data;
}
