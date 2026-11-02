import { useEffect, useRef, useState } from 'react';
import {
  configurePdfWorker,
  destroyPdf,
  loadPdf,
  PDFRenderer,
  type PageMetrics,
} from '../analysis';
import type { Finding } from '../types/findings';

interface PdfViewerProps {
  data: ArrayBuffer;
  pageCountHint?: number;
  findings: Finding[];
  selectedFindingId: string | null;
  inspectionMode: boolean;
  focusPage?: number | null;
}

export function PdfViewer({
  data,
  findings,
  selectedFindingId,
  inspectionMode,
  focusPage,
}: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<PDFRenderer | null>(null);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [metrics, setMetrics] = useState<PageMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    configurePdfWorker();

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const copy = data.slice(0);
        const loaded = await loadPdf(copy);
        if (cancelled) {
          await destroyPdf(loaded.document);
          return;
        }
        rendererRef.current?.destroy();
        rendererRef.current = new PDFRenderer(loaded.document);
        setPageCount(loaded.pageCount);
        setPage(1);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Falha ao abrir o PDF.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      rendererRef.current?.destroy();
      rendererRef.current = null;
    };
  }, [data]);

  useEffect(() => {
    if (focusPage && focusPage >= 1) {
      setPage(focusPage);
    }
  }, [focusPage, selectedFindingId]);

  useEffect(() => {
    const renderer = rendererRef.current;
    const canvas = canvasRef.current;
    if (!renderer || !canvas || loading) return;

    let cancelled = false;
    (async () => {
      try {
        const m = await renderer.renderPage({
          pageNumber: page,
          canvas,
          scale,
        });
        if (!cancelled) setMetrics(m);
      } catch (err) {
        if (!cancelled && !(err instanceof Error && /Rendering cancelled/i.test(err.message))) {
          setError(err instanceof Error ? err.message : 'Erro ao renderizar.');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [page, scale, loading]);

  const pageFindings = findings.filter(
    (f) => f.page === page && f.bbox && f.category !== 'limitation',
  );
  const offPageFindings = findings.filter(
    (f) =>
      f.page === page &&
      (f.visibility === 'off_page' ||
        (f.bbox &&
          metrics &&
          (f.bbox.x < -2 ||
            f.bbox.y < -2 ||
            f.bbox.x > metrics.width + 2 ||
            f.bbox.y > metrics.height + 2))),
  );

  return (
    <div className="viewer-panel">
      <div className="panel-toolbar">
        <div className="meta">
          Página {page} / {pageCount}
          {inspectionMode ? ' · inspeção' : ' · original'}
        </div>
        <button
          type="button"
          className="tool-btn"
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          Anterior
        </button>
        <button
          type="button"
          className="tool-btn"
          disabled={page >= pageCount}
          onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
        >
          Próxima
        </button>
        <button
          type="button"
          className="tool-btn"
          onClick={() => setScale((s) => Math.max(0.5, Number((s - 0.15).toFixed(2))))}
        >
          −
        </button>
        <button
          type="button"
          className="tool-btn"
          onClick={() => setScale((s) => Math.min(3, Number((s + 0.15).toFixed(2))))}
        >
          +
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="viewer-stage">
        <div>
          <div className="page-frame">
            <canvas ref={canvasRef} />
            {inspectionMode &&
              metrics &&
              pageFindings.map((f) => {
                if (!f.bbox || !rendererRef.current) return null;
                const box = rendererRef.current.pdfBoxToOverlay(f.bbox, metrics);
                // Textos minúsculos: ampliar visualmente o highlight
                const minSize = f.visibility === 'tiny' ? 18 : 0;
                return (
                  <div
                    key={f.id}
                    className={`overlay-box${selectedFindingId === f.id ? ' selected' : ''}`}
                    style={{
                      left: box.left,
                      top: box.top,
                      width: Math.max(box.width, minSize),
                      height: Math.max(box.height, minSize),
                    }}
                    title={f.text}
                  />
                );
              })}
          </div>

          {inspectionMode && offPageFindings.length > 0 && (
            <div className="offpage-tray">
              <h4>Conteúdo fora da área visível (página {page})</h4>
              {offPageFindings.map((f) => (
                <div key={f.id} className="offpage-item">
                  {f.text.slice(0, 160) || '(vazio)'} — {f.reason}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
