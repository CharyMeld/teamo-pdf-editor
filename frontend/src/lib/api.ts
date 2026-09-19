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

/** Real bytes of the document's CURRENT state — the pending working-copy
 * step's file if one exists, otherwise the same saved version
 * `documentFileUrl` serves. Phase 7 (OCR): `documentFileUrl` only ever
 * serves the last SAVE, so pdf.js's canvas/search-index reload after an
 * OCR job commits a step (which doesn't auto-Save) needs this instead —
 * see `reloadPdfDocument`'s docblock in useOpenDocument and
 * DocumentEditController::workingFile's docblock server-side. */
export function workingFileUrl(id: string): string {
  return `${API_BASE_URL}/documents/${id}/working/file`;
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

// ---------------------------------------------------------------------------
// Phase 4 — EDIT: real content-editing operations against the backend's
// FPDI/FPDF-backed engine (see ARCHITECTURE.md's Phase 4 (backend) section).
// Content edits are just another kind of Phase 3 working-copy step, so they
// share OperationResult's exact shape (plus `objectId`) and the same
// undo/redo/Save machinery — no separate state model on the frontend either.

export type ContentObjectType = "text" | "text_overlay_edit" | "image";
export type TextAlign = "left" | "center" | "right";

export interface TextObjectParams {
  text: string;
  font: "Helvetica" | "Times" | "Courier";
  fontSize: number;
  bold: boolean;
  italic: boolean;
  color: string;
  align: TextAlign;
  lineSpacing: number;
}

export interface ImageObjectParams {
  storagePath?: string;
  originalFilename?: string;
}

export interface ContentBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ContentObject {
  objectId: string;
  type: ContentObjectType;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  params: TextObjectParams | ImageObjectParams;
}

export interface ContentObjectsResponse {
  objects: ContentObject[];
  availableFonts: string[];
}

export interface ContentOperationResult extends OperationResult {
  objectId: string;
}

export async function getContentObjects(id: string, page?: number): Promise<ContentObjectsResponse> {
  const { data } = await api.get<{ data: ContentObject[]; availableFonts: string[] }>(
    `/documents/${id}/content/objects`,
    { params: page ? { page } : undefined },
  );
  return { objects: data.data, availableFonts: data.availableFonts };
}

export interface CreateTextObjectInput {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  params: TextObjectParams;
}

export function createTextObject(id: string, input: CreateTextObjectInput): Promise<ContentOperationResult> {
  const { page, x, y, width, height, rotation, params } = input;
  return api
    .post<ContentOperationResult>(`/documents/${id}/content/objects`, {
      type: "text",
      page,
      x,
      y,
      width,
      height,
      rotation,
      params,
    })
    .then((r) => r.data);
}

export interface CreateOverlayEditInput extends CreateTextObjectInput {
  coverOriginal: ContentBox;
  coverColor?: string;
}

export function createOverlayTextEdit(
  id: string,
  input: CreateOverlayEditInput,
): Promise<ContentOperationResult> {
  const { page, x, y, width, height, rotation, params, coverOriginal, coverColor } = input;
  return api
    .post<ContentOperationResult>(`/documents/${id}/content/objects`, {
      type: "text_overlay_edit",
      page,
      x,
      y,
      width,
      height,
      rotation,
      // The backend validates/stores coverOriginal and coverColor as part
      // of `params` (see DocumentContentController::validateObjectPayload
      // and ContentObjectService), not as sibling top-level fields.
      params: { ...params, coverOriginal, coverColor },
    })
    .then((r) => r.data);
}

export interface CreateImageObjectInput {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  file: File;
}

export function createImageObject(id: string, input: CreateImageObjectInput): Promise<ContentOperationResult> {
  const form = new FormData();
  form.append("type", "image");
  form.append("page", String(input.page));
  form.append("x", String(input.x));
  form.append("y", String(input.y));
  form.append("width", String(input.width));
  form.append("height", String(input.height));
  form.append("file", input.file);
  return api.post<ContentOperationResult>(`/documents/${id}/content/objects`, form).then((r) => r.data);
}

export type PatchContentObjectInput = Partial<{
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  params: Partial<TextObjectParams>;
}>;

export function patchContentObject(
  id: string,
  objectId: string,
  patch: PatchContentObjectInput,
): Promise<ContentOperationResult> {
  return api
    .patch<ContentOperationResult>(`/documents/${id}/content/objects/${objectId}`, patch)
    .then((r) => r.data);
}

export function deleteContentObject(id: string, objectId: string): Promise<ContentOperationResult> {
  return api.delete<ContentOperationResult>(`/documents/${id}/content/objects/${objectId}`).then((r) => r.data);
}

export function duplicateContentObject(id: string, objectId: string): Promise<ContentOperationResult> {
  return api
    .post<ContentOperationResult>(`/documents/${id}/content/objects/${objectId}/duplicate`)
    .then((r) => r.data);
}

// ---------------------------------------------------------------------------
// Phase 5 — ANNOTATE: real annotation operations against the backend's
// PdfAnnotationEngine (see ARCHITECTURE.md's Phase 5 section). A parallel,
// independent chain from Phase 4's content objects — shares the exact same
// OperationResult envelope (plus `annotationId`) and the same
// undo/redo/Save machinery, no separate state model needed here either.

export type AnnotationType =
  | "highlight"
  | "underline"
  | "strikethrough"
  | "freehand"
  | "rectangle"
  | "circle"
  | "arrow"
  | "text_box"
  | "sticky_note"
  | "stamp";

export interface MarkAnnotationParams {
  color: string;
  opacity?: number; // highlight only
  thickness?: number; // underline/strikethrough only
}

export interface ShapeAnnotationParams {
  strokeColor: string;
  strokeWidth: number;
  fillColor?: string;
  fillOpacity?: number;
}

export interface FreehandPoint {
  x: number;
  y: number;
}

export interface FreehandAnnotationParams {
  points: FreehandPoint[];
  color: string;
  thickness: number;
}

export interface ArrowAnnotationParams {
  color: string;
  thickness: number;
}

export interface TextBoxAnnotationParams {
  text: string;
  font: "Helvetica" | "Times" | "Courier";
  fontSize: number;
  bold: boolean;
  italic: boolean;
  color: string;
  align: TextAlign;
  lineSpacing: number;
  backgroundColor?: string;
  borderColor?: string;
}

export interface StickyNoteAnnotationParams {
  note: string;
  color: string;
}

export interface StampAnnotationParams {
  stampKind: "preset" | "image";
  presetKey?: string;
  storagePath?: string;
  originalFilename?: string;
}

export type AnnotationParams =
  | MarkAnnotationParams
  | ShapeAnnotationParams
  | FreehandAnnotationParams
  | ArrowAnnotationParams
  | TextBoxAnnotationParams
  | StickyNoteAnnotationParams
  | StampAnnotationParams;

export interface Annotation {
  annotationId: string;
  type: AnnotationType;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  /** Arrow only: the literal tail (x,y) -> head (x2,y2) points; x/y/width/height are still the derived bounding box every other type's selection handles rely on. */
  x2?: number;
  y2?: number;
  params: AnnotationParams;
}

export interface StampPreset {
  label: string;
  color: string;
}

export interface AnnotationsResponse {
  annotations: Annotation[];
  stampPresets: Record<string, StampPreset>;
}

export interface AnnotationOperationResult extends OperationResult {
  annotationId: string;
}

export async function getAnnotations(id: string, page?: number): Promise<AnnotationsResponse> {
  const { data } = await api.get<{ data: Annotation[]; stampPresets: Record<string, StampPreset> }>(
    `/documents/${id}/annotations`,
    { params: page ? { page } : undefined },
  );
  return { annotations: data.data, stampPresets: data.stampPresets };
}

export interface CreateAnnotationInput {
  type: AnnotationType;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  x2?: number;
  y2?: number;
  params: Record<string, unknown>;
  /** stamp (stampKind: "image") only. */
  file?: File;
}

/**
 * One generic creator rather than Phase 4's one-function-per-type style —
 * with 10 annotation types (vs Phase 4's 3), a `createHighlight`/
 * `createUnderline`/... per type would be pure boilerplate; every type
 * shares the exact same request shape (a discriminated `type` plus
 * `params`), so a single function taking that union is a deliberate,
 * justified deviation from Phase 4's own precedent, not an inconsistency.
 */
export function createAnnotation(id: string, input: CreateAnnotationInput): Promise<AnnotationOperationResult> {
  if (input.file) {
    const form = new FormData();
    form.append("type", input.type);
    form.append("page", String(input.page));
    form.append("x", String(input.x));
    form.append("y", String(input.y));
    form.append("width", String(input.width));
    form.append("height", String(input.height));
    if (input.rotation !== undefined) form.append("rotation", String(input.rotation));
    Object.entries(input.params).forEach(([key, value]) => form.append(`params[${key}]`, String(value)));
    form.append("file", input.file);
    return api.post<AnnotationOperationResult>(`/documents/${id}/annotations`, form).then((r) => r.data);
  }

  return api
    .post<AnnotationOperationResult>(`/documents/${id}/annotations`, {
      type: input.type,
      page: input.page,
      x: input.x,
      y: input.y,
      width: input.width,
      height: input.height,
      rotation: input.rotation,
      x2: input.x2,
      y2: input.y2,
      params: input.params,
    })
    .then((r) => r.data);
}

export type PatchAnnotationInput = Partial<{
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  x2: number;
  y2: number;
  params: Record<string, unknown>;
}>;

export function patchAnnotation(
  id: string,
  annotationId: string,
  patch: PatchAnnotationInput,
): Promise<AnnotationOperationResult> {
  return api
    .patch<AnnotationOperationResult>(`/documents/${id}/annotations/${annotationId}`, patch)
    .then((r) => r.data);
}

export function deleteAnnotation(id: string, annotationId: string): Promise<AnnotationOperationResult> {
  return api.delete<AnnotationOperationResult>(`/documents/${id}/annotations/${annotationId}`).then((r) => r.data);
}

export function duplicateAnnotation(id: string, annotationId: string): Promise<AnnotationOperationResult> {
  return api
    .post<AnnotationOperationResult>(`/documents/${id}/annotations/${annotationId}/duplicate`)
    .then((r) => r.data);
}

// ---------------------------------------------------------------------------
// Phase 6 — SCAN: the scanning/image-import workflow (Create PDF from
// Images). A `ScanSession` exists independently of any `Document` until
// `createScanPdf()` returns one — see ARCHITECTURE.md's Phase 6 section.
// Crop coordinates here are TOP-LEFT-origin pixel coordinates (standard
// raster-image convention, matching Imagick's own `cropImage()` contract),
// deliberately NOT the bottom-left PDF-point convention Phase 3/4/5's crop/
// object endpoints use — there's no PDF page involved yet at this stage.

export interface ScanImageCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScanImageParams {
  rotationDegrees: 0 | 90 | 180 | 270 | -90;
  deskew: boolean;
  crop: ScanImageCrop | null;
  brightness: number; // -100..100
  contrast: number; // -100..100
  sharpen: number; // 0..100
  noiseReduction: number; // 0..100
  backgroundCleanup: boolean;
  excluded: boolean;
}

export interface ScanSessionImage {
  id: number;
  position: number;
  filename: string;
  widthPx: number;
  heightPx: number;
  params: ScanImageParams;
  blankPageDetected: boolean;
}

export async function createScanSession(): Promise<string> {
  const { data } = await api.post<{ id: string }>("/scan-sessions");
  return data.id;
}

export async function getScanSession(sessionId: string): Promise<ScanSessionImage[]> {
  const { data } = await api.get<{ data: ScanSessionImage[] }>(`/scan-sessions/${sessionId}`);
  return data.data;
}

export async function addScanImages(sessionId: string, files: File[]): Promise<ScanSessionImage[]> {
  const form = new FormData();
  files.forEach((file) => form.append("images[]", file));
  const { data } = await api.post<{ data: ScanSessionImage[] }>(`/scan-sessions/${sessionId}/images`, form);
  return data.data;
}

export type PatchScanImageInput = Partial<ScanImageParams>;

export async function patchScanImage(
  sessionId: string,
  imageId: number,
  patch: PatchScanImageInput,
): Promise<ScanSessionImage> {
  const { data } = await api.patch<{ data: ScanSessionImage }>(`/scan-sessions/${sessionId}/images/${imageId}`, patch);
  return data.data;
}

export async function reorderScanImages(sessionId: string, imageIds: number[]): Promise<ScanSessionImage[]> {
  const { data } = await api.post<{ data: ScanSessionImage[] }>(`/scan-sessions/${sessionId}/reorder`, { imageIds });
  return data.data;
}

export async function removeScanImage(sessionId: string, imageId: number): Promise<void> {
  await api.delete(`/scan-sessions/${sessionId}/images/${imageId}`);
}

/** Returns an object URL for the image's CURRENT processed preview — caller must `URL.revokeObjectURL()` it when done. */
export async function getScanImagePreviewUrl(sessionId: string, imageId: number): Promise<string> {
  const { data } = await api.get(`/scan-sessions/${sessionId}/images/${imageId}/preview`, { responseType: "blob" });
  return URL.createObjectURL(data as Blob);
}

export async function createScanPdf(sessionId: string, title: string): Promise<DocumentSummary> {
  const { data } = await api.post<{ document: DocumentSummary }>(`/scan-sessions/${sessionId}/create-pdf`, { title });
  return data.document;
}

// ---------------------------------------------------------------------------
// Phase 7 — OCR: recognizes text on scanned pages and splices it into the
// working copy as real, extractable page content — see OcrService's
// docblock. Unlike Phase 3/4/5's synchronous operation endpoints, this
// runs as a queued job: `startOcr` only enqueues it and returns a job id;
// callers poll `getOcrJob` for progress and the final `OcrJobSummary`
// (Phase 3-shaped: pageCount/canUndo/canRedo, reusable via
// `working.applyOperationResult` directly, plus a per-page `results` list).

export type OcrJobStatus = "queued" | "processing" | "completed" | "failed" | "cancelled";

export interface OcrPageResult {
  page: number;
  status: "recognized" | "skipped" | "cancelled";
  reason?: string;
}

export interface OcrJobSummary {
  pageCount: number;
  canUndo: boolean;
  canRedo: boolean;
  results: OcrPageResult[];
}

export interface OcrJobState {
  status: OcrJobStatus;
  progressPercent: number | null;
  errorMessage: string | null;
  payload: OcrJobSummary | null;
}

export async function getOcrLanguages(id: string): Promise<string[]> {
  const { data } = await api.get<{ data: string[] }>(`/documents/${id}/ocr/languages`);
  return data.data;
}

export async function startOcr(
  id: string,
  pages: number[] | "all",
  language: string,
): Promise<{ jobId: number }> {
  const { data } = await api.post<{ jobId: number }>(`/documents/${id}/ocr`, { pages, language });
  return data;
}

export async function getOcrJob(id: string, jobId: number): Promise<OcrJobState> {
  const { data } = await api.get<OcrJobState>(`/documents/${id}/ocr/jobs/${jobId}`);
  return data;
}

export async function cancelOcrJob(id: string, jobId: number): Promise<void> {
  await api.post(`/documents/${id}/ocr/jobs/${jobId}/cancel`);
}

// ---------------------------------------------------------------------------
// Phase 8 — document conversion. FROM an existing PDF (PDF -> TXT / Images /
// Word) is a queued job polled exactly like Phase 7's OCR — see
// ConversionService's docblock server-side for why the result is a
// standalone downloadable file rather than a working-copy mutation. TO a
// new PDF (a real .docx Word document -> PDF) creates a brand-new
// Document, same shape as Phase 6's Images -> PDF.

export type ConversionFormat = "txt" | "images" | "docx";
export type ConversionJobStatus = "queued" | "processing" | "completed" | "failed";

export interface ConversionResult {
  outputPath: string;
  downloadFilename: string;
  mimeType: string;
  sizeBytes: number;
}

export interface ConversionJobState {
  status: ConversionJobStatus;
  progressPercent: number | null;
  errorMessage: string | null;
  payload: ConversionResult | null;
}

export async function startConversion(
  id: string,
  format: ConversionFormat,
  pages: number[] | "all" | undefined,
  imageFormat: "png" | "jpeg" | undefined,
): Promise<{ jobId: number }> {
  const { data } = await api.post<{ jobId: number }>(`/documents/${id}/conversions`, {
    format,
    pages,
    imageFormat,
  });
  return data;
}

export async function getConversionJob(id: string, jobId: number): Promise<ConversionJobState> {
  const { data } = await api.get<ConversionJobState>(`/documents/${id}/conversions/jobs/${jobId}`);
  return data;
}

/** URL for the real produced file — navigating to it triggers a real browser download (Content-Disposition: attachment), no client-side blob handling needed. */
export function conversionDownloadUrl(id: string, jobId: number): string {
  return `${API_BASE_URL}/documents/${id}/conversions/jobs/${jobId}/download`;
}

export async function convertOfficeToPdf(file: File): Promise<DocumentSummary> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<{ document: DocumentSummary }>("/office-conversions", form);
  return data.document;
}

// ---------------------------------------------------------------------------
// Phase 9 — PDF and file compression. Queued and polled exactly like
// Phase 8's conversions. By default the result is a standalone
// downloadable file (the currently-open document is never touched); an
// explicit "replace" call is what commits it into the working copy — see
// CompressionService's docblock server-side.

export type CompressionFormat = "pdf" | "zip";
export type CompressionPreset = "maxQuality" | "balanced" | "maxCompression" | "custom";
export type CompressionJobStatus = "queued" | "processing" | "completed" | "failed";

export interface CompressionCustomOptions {
  imageDpi?: number;
  imageQuality?: number;
  imageFormat?: "jpeg" | "lossless";
  subsetFonts?: boolean;
}

export interface CompressionResult {
  format: CompressionFormat;
  outputPath: string;
  downloadFilename: string;
  mimeType: string;
  sizeBytes: number;
  originalSizeBytes: number;
  /** Null for a "zip" result — wrapping an already-compressed PDF stream in a zip barely changes size, so a percentage here would mislead more than inform. */
  percentReduction: number | null;
  pageCount: number;
  preset?: CompressionPreset;
}

export interface CompressionJobState {
  status: CompressionJobStatus;
  progressPercent: number | null;
  errorMessage: string | null;
  payload: CompressionResult | null;
}

export async function startCompression(
  id: string,
  format: CompressionFormat,
  preset: CompressionPreset | undefined,
  custom: CompressionCustomOptions | undefined,
  removeMetadata: boolean,
  cleanupUnusedObjects: boolean,
): Promise<{ jobId: number }> {
  const { data } = await api.post<{ jobId: number }>(`/documents/${id}/compressions`, {
    format,
    preset,
    custom,
    removeMetadata,
    cleanupUnusedObjects,
  });
  return data;
}

export async function getCompressionJob(id: string, jobId: number): Promise<CompressionJobState> {
  const { data } = await api.get<CompressionJobState>(`/documents/${id}/compressions/jobs/${jobId}`);
  return data;
}

export function compressionDownloadUrl(id: string, jobId: number): string {
  return `${API_BASE_URL}/documents/${id}/compressions/jobs/${jobId}/download`;
}

/** Commits an already-completed compression result into the working copy — a normal, undoable pending edit, not an immediate overwrite. */
export async function replaceWithCompression(id: string, jobId: number): Promise<OperationResult> {
  const { data } = await api.post<OperationResult>(`/documents/${id}/compressions/jobs/${jobId}/replace`);
  return data;
}

// ---------------------------------------------------------------------------
// Phase 10 — PDF forms. A real, independent `form_field_*` working-copy
// chain (a sibling to Phase 4's content objects and Phase 5's annotations)
// — see FormFieldService's docblock server-side. Five field types are real,
// native, independently fillable AcroForm widgets; `signature` is a visual
// placeholder only (see FormFieldEngine's docblock) — full signing is a
// later phase. Fill/clear are just another mutation of the same chain, so
// filled values survive later design edits (add/move/resize a field) —
// a real bug found and fixed during this phase's own testing.

export type FormFieldType = "text" | "checkbox" | "radio" | "dropdown" | "date" | "signature";

export interface TextFieldParams {
  required: boolean;
  defaultValue: string;
  maxLength: number | null;
  multiline: boolean;
}
export interface DateFieldParams {
  required: boolean;
  defaultValue: string;
  dateFormat: string;
}
export interface CheckboxFieldParams {
  required: boolean;
  label: string;
  defaultChecked: boolean;
}
export interface RadioFieldParams {
  required: boolean;
  groupName: string;
  optionValue: string;
  defaultSelected: boolean;
}
export interface DropdownFieldParams {
  required: boolean;
  options: string[];
  defaultValue: string;
}
export interface SignatureFieldParams {
  label: string;
}

export type FormFieldParams =
  | TextFieldParams
  | DateFieldParams
  | CheckboxFieldParams
  | RadioFieldParams
  | DropdownFieldParams
  | SignatureFieldParams;

export interface FormField {
  fieldId: string;
  type: FormFieldType;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  params: FormFieldParams;
}

export interface FormFieldOperationResult extends OperationResult {
  fieldId: string;
}

export async function getFormFields(id: string, page?: number): Promise<FormField[]> {
  const { data } = await api.get<{ data: FormField[] }>(`/documents/${id}/form/fields`, {
    params: page ? { page } : undefined,
  });
  return data.data;
}

export interface CreateFormFieldInput {
  type: FormFieldType;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  params: Record<string, unknown>;
}

export function createFormField(id: string, input: CreateFormFieldInput): Promise<FormFieldOperationResult> {
  return api.post<FormFieldOperationResult>(`/documents/${id}/form/fields`, input).then((r) => r.data);
}

export type PatchFormFieldInput = Partial<{
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  params: Record<string, unknown>;
}>;

export function patchFormField(
  id: string,
  fieldId: string,
  patch: PatchFormFieldInput,
): Promise<FormFieldOperationResult> {
  return api.patch<FormFieldOperationResult>(`/documents/${id}/form/fields/${fieldId}`, patch).then((r) => r.data);
}

export function deleteFormField(id: string, fieldId: string): Promise<FormFieldOperationResult> {
  return api.delete<FormFieldOperationResult>(`/documents/${id}/form/fields/${fieldId}`).then((r) => r.data);
}

export function duplicateFormField(id: string, fieldId: string): Promise<FormFieldOperationResult> {
  return api.post<FormFieldOperationResult>(`/documents/${id}/form/fields/${fieldId}/duplicate`).then((r) => r.data);
}

/** Keyed by fieldId for text/checkbox/dropdown/date, or by groupName for a radio group. */
export function fillFormValues(id: string, values: Record<string, unknown>): Promise<OperationResult> {
  return api.post<OperationResult>(`/documents/${id}/form/fill`, { values }).then((r) => r.data);
}

export function clearFormValues(id: string, fieldKeys?: string[]): Promise<OperationResult> {
  return api.post<OperationResult>(`/documents/${id}/form/clear`, { fieldKeys }).then((r) => r.data);
}
