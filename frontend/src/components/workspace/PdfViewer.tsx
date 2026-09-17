import { useCallback, useEffect, useRef, useState } from "react";
import ContentObjectLayer from "../../content-editor/ContentObjectLayer";
import { useDocumentViewState } from "../../hooks/useDocumentViewState";
import { useOpenDocument } from "../../hooks/useOpenDocument";
import { pdfjsLib } from "../../lib/pdf";
import Button from "../ui/Button";
import Icon from "../ui/Icon";
import Spinner from "../ui/Spinner";

/** Pages within this many screen-heights of the viewport get a real
 * `<canvas>`; everything further away is a correctly-sized empty
 * placeholder — this is what keeps the DOM/canvas count bounded on a
 * 261-page document instead of rendering all of it at once. */
const ROOT_MARGIN = "800px 0px 800px 0px";
const FALLBACK_ASPECT_RATIO = 1.294; // US Letter height/width, used only for
// a page the backend failed to report dimensions for (see ThumbnailPanel's
// same fallback) until pdf.js's own render resolves its real size.

interface PageEntry {
  pageNumber: number;
  widthPt: number;
  heightPt: number;
}

/**
 * The real PDF canvas: continuous vertical scroll, one real pdf.js
 * `<canvas>` per page that's near the viewport, plain sized placeholder
 * divs for the rest. See ARCHITECTURE.md's Phase 2 section for the
 * virtualization design and why thumbnails are rendered server-side while
 * this uses client-side pdf.js instead.
 */
export default function PdfViewer() {
  const view = useDocumentViewState();
  const { document: doc, pdfDoc, pages, activeMatchPage } = useOpenDocument();

  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef(new Map<number, HTMLDivElement>());
  const canvasRefs = useRef(new Map<number, HTMLCanvasElement>());
  const renderTasksRef = useRef(new Map<number, pdfjsLib.RenderTask>());
  const renderedAtScaleRef = useRef(new Map<number, number>());
  // A monotonically increasing per-page token — the real guard against two
  // renders racing the same <canvas> (e.g. two zoom clicks in quick
  // succession before the first getPage()/render() round-trip finishes).
  // `.cancel()` below is a best-effort speed-up; this token is what
  // actually prevents a stale render from touching the canvas or being
  // mistaken for a genuine failure.
  const renderTokenRef = useRef(new Map<number, number>());
  const visiblePagesRef = useRef(new Set<number>());

  const [visiblePages, setVisiblePages] = useState<Set<number>>(new Set());
  const [pageErrors, setPageErrors] = useState<Set<number>>(new Set());
  const [resizeTick, setResizeTick] = useState(0);

  const pageEntries: PageEntry[] = pages.map((p) => ({
    pageNumber: p.pageNumber,
    widthPt: p.widthPt,
    heightPt: p.heightPt,
  }));
  const totalPages = doc?.pageCount ?? pageEntries.length;
  // A page the backend couldn't thumbnail still needs a slot in the
  // scroll list — fall back to the nearest known page's aspect ratio, or
  // a standard page shape, purely for placeholder sizing.
  const referenceEntry = pageEntries[0];
  const allEntries: PageEntry[] = Array.from({ length: totalPages }, (_, i) => {
    const pageNumber = i + 1;
    const known = pageEntries.find((p) => p.pageNumber === pageNumber);
    if (known) return known;
    const widthPt = referenceEntry?.widthPt ?? 612;
    return { pageNumber, widthPt, heightPt: widthPt * FALLBACK_ASPECT_RATIO };
  });

  // --- Fit Page / Fit Width: compute the effective zoom from real page
  // dimensions and the real container size, then push it into
  // useDocumentViewState purely for display (doesn't touch fitMode).
  useEffect(() => {
    if (view.fitMode === "none") return;
    const container = scrollRef.current;
    const refPage =
      allEntries.find((p) => p.pageNumber === view.currentPage) ?? allEntries[0];
    if (!container || !refPage) return;

    const containerWidth = container.clientWidth - 32;
    const containerHeight = container.clientHeight - 32;
    const scale =
      view.fitMode === "width"
        ? containerWidth / refPage.widthPt
        : Math.min(containerWidth / refPage.widthPt, containerHeight / refPage.heightPt);

    if (scale > 0 && Number.isFinite(scale)) {
      view.syncComputedZoomPercent(scale * 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.fitMode, view.currentPage, resizeTick, allEntries.length]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => setResizeTick((t) => t + 1));
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // --- Which pages are near the viewport (real IntersectionObserver, not
  // a scroll-position heuristic).
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const next = new Set(visiblePagesRef.current);
        let mostVisible: { page: number; ratio: number } | null = null;

        for (const entry of entries) {
          const pageNumber = Number((entry.target as HTMLElement).dataset.pageNumber);
          if (entry.isIntersecting) {
            next.add(pageNumber);
            if (!mostVisible || entry.intersectionRatio > mostVisible.ratio) {
              mostVisible = { page: pageNumber, ratio: entry.intersectionRatio };
            }
          } else {
            next.delete(pageNumber);
          }
        }

        visiblePagesRef.current = next;
        setVisiblePages(new Set(next));

        if (mostVisible && mostVisible.page !== view.currentPage) {
          view.goToPage(mostVisible.page);
        }
      },
      { root, rootMargin: ROOT_MARGIN, threshold: [0, 0.25, 0.5, 0.75, 1] },
    );

    for (const el of pageRefs.current.values()) observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allEntries.length, doc?.id]);

  // --- Programmatic navigation (prev/next, thumbnail click, search jump)
  // — only scroll if the target page isn't already in view, so this never
  // fights a page the user is already scrolling through manually.
  useEffect(() => {
    if (visiblePagesRef.current.has(view.currentPage)) return;
    const el = pageRefs.current.get(view.currentPage);
    el?.scrollIntoView({ block: "start", behavior: "auto" });
  }, [view.currentPage]);

  // --- Render (or re-render on zoom change) every page currently visible.
  useEffect(() => {
    if (!pdfDoc) return;
    const scale = view.zoomPercent / 100;

    for (const pageNumber of visiblePages) {
      const canvas = canvasRefs.current.get(pageNumber);
      if (!canvas) continue;
      if (renderedAtScaleRef.current.get(pageNumber) === scale) continue;

      const myToken = (renderTokenRef.current.get(pageNumber) ?? 0) + 1;
      renderTokenRef.current.set(pageNumber, myToken);
      const isCurrent = () => renderTokenRef.current.get(pageNumber) === myToken;

      renderTasksRef.current.get(pageNumber)?.cancel();
      setPageErrors((prev) => {
        if (!prev.has(pageNumber)) return prev;
        const next = new Set(prev);
        next.delete(pageNumber);
        return next;
      });

      pdfDoc
        .getPage(pageNumber)
        .then((page) => {
          if (!isCurrent()) return;
          const viewport = page.getViewport({ scale });
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const context = canvas.getContext("2d");
          if (!context) return;
          const task = page.render({ canvasContext: context, viewport });
          renderTasksRef.current.set(pageNumber, task);
          return task.promise.then(() => {
            if (isCurrent()) renderedAtScaleRef.current.set(pageNumber, scale);
          });
        })
        .catch((error: unknown) => {
          // A stale render (superseded by a newer zoom/visibility change)
          // is not a real failure, whatever shape its rejection takes —
          // ignore anything that isn't from the current attempt.
          if (!isCurrent()) return;
          if (error instanceof Error && error.name === "RenderingCancelledException") return;
          setPageErrors((prev) => new Set(prev).add(pageNumber));
        });
    }
  }, [visiblePages, pdfDoc, view.zoomPercent]);

  const retryPage = useCallback((pageNumber: number) => {
    renderedAtScaleRef.current.delete(pageNumber);
    setPageErrors((prev) => {
      const next = new Set(prev);
      next.delete(pageNumber);
      return next;
    });
    setVisiblePages((prev) => new Set(prev));
  }, []);

  return (
    <main
      ref={scrollRef}
      className="canvas-viewport flex-1 overflow-auto bg-bg"
      aria-label="Document pages"
    >
      <div className="flex flex-col items-center gap-4 px-4 py-4">
        {allEntries.map((entry) => {
          const scale = view.zoomPercent / 100;
          const widthPx = entry.widthPt * scale;
          const heightPx = entry.heightPt * scale;
          const isVisible = visiblePages.has(entry.pageNumber);
          const hasError = pageErrors.has(entry.pageNumber);
          const isActiveMatch = activeMatchPage === entry.pageNumber;

          return (
            <div
              key={entry.pageNumber}
              ref={(node) => {
                if (node) pageRefs.current.set(entry.pageNumber, node);
                else pageRefs.current.delete(entry.pageNumber);
              }}
              data-page-number={entry.pageNumber}
              style={{ width: widthPx, height: heightPx }}
              className={[
                "relative shrink-0 bg-white shadow-sm",
                isActiveMatch ? "ring-2 ring-accent" : "",
              ].join(" ")}
            >
              {isVisible && !hasError && (
                <canvas
                  ref={(node) => {
                    if (node) canvasRefs.current.set(entry.pageNumber, node);
                    else canvasRefs.current.delete(entry.pageNumber);
                  }}
                  className="absolute inset-0 h-full w-full"
                />
              )}
              {isVisible && hasError && (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 border border-danger/40 bg-danger-subtle text-center">
                  <span className="text-danger">
                    <Icon name="close" size={18} />
                  </span>
                  <p className="max-w-40 text-[11px] text-danger">
                    Couldn't render page {entry.pageNumber}.
                  </p>
                  <Button size="sm" variant="secondary" onClick={() => retryPage(entry.pageNumber)}>
                    Retry
                  </Button>
                </div>
              )}
              {!isVisible && (
                <div className="flex h-full w-full items-center justify-center border border-border/60 bg-surface-muted">
                  <Spinner size={14} label={`Page ${entry.pageNumber}`} />
                </div>
              )}
              {/* Phase 4's content-object overlay only tracks the currently
                  viewed page (see useContentObjects's fetch scope), and
                  only makes sense once that page has actually rendered. */}
              {isVisible && !hasError && entry.pageNumber === view.currentPage && (
                <ContentObjectLayer
                  pageNumber={entry.pageNumber}
                  widthPt={entry.widthPt}
                  heightPt={entry.heightPt}
                  scale={scale}
                />
              )}
              <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[10px] text-text-subtle">
                {entry.pageNumber}
              </span>
            </div>
          );
        })}
      </div>
    </main>
  );
}
