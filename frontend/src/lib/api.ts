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
