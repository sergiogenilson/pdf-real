import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist';
import type { BoundingBox } from '../types/findings';

export interface RenderPageOptions {
  pageNumber: number;
  canvas: HTMLCanvasElement;
  scale?: number;
}

export interface PageMetrics {
  pageNumber: number;
  width: number;
  height: number;
  scale: number;
  viewportWidth: number;
  viewportHeight: number;
}

/**
 * Renderiza páginas sob demanda em canvas.
 * Não carrega todas as páginas simultaneamente.
 */
export class PDFRenderer {
  private activeTask: RenderTask | null = null;
  private currentPage: PDFPageProxy | null = null;
  private readonly document: PDFDocumentProxy;

  constructor(document: PDFDocumentProxy) {
    this.document = document;
  }

  async getPageMetrics(pageNumber: number, scale = 1.25): Promise<PageMetrics> {
    const page = await this.document.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    return {
      pageNumber,
      width: page.view[2] - page.view[0],
      height: page.view[3] - page.view[1],
      scale,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
    };
  }

  async renderPage(options: RenderPageOptions): Promise<PageMetrics> {
    await this.cancel();

    const page = await this.document.getPage(options.pageNumber);
    this.currentPage = page;
    const scale = options.scale ?? 1.25;
    const viewport = page.getViewport({ scale });

    const canvas = options.canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas 2D indisponível.');
    }

    const outputScale = window.devicePixelRatio || 1;
    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;

    const transform =
      outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);

    this.activeTask = page.render({
      canvasContext: context,
      canvas,
      viewport,
      transform,
      background: '#ffffff',
      annotationMode: 0, // DISABLE — não executar anotações/JS
    });

    try {
      await this.activeTask.promise;
    } finally {
      this.activeTask = null;
    }

    return {
      pageNumber: options.pageNumber,
      width: page.view[2] - page.view[0],
      height: page.view[3] - page.view[1],
      scale,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
    };
  }

  /** Converte bbox em coordenadas PDF (origem inferior-esquerda) para CSS overlay. */
  pdfBoxToOverlay(
    box: BoundingBox,
    metrics: PageMetrics,
  ): { left: number; top: number; width: number; height: number } {
    const pageHeight = metrics.height;
    return {
      left: box.x * metrics.scale,
      top: (pageHeight - box.y - box.height) * metrics.scale,
      width: box.width * metrics.scale,
      height: box.height * metrics.scale,
    };
  }

  async cancel(): Promise<void> {
    if (this.activeTask) {
      try {
        this.activeTask.cancel();
      } catch {
        // ignore
      }
      this.activeTask = null;
    }
    if (this.currentPage) {
      try {
        this.currentPage.cleanup();
      } catch {
        // ignore
      }
      this.currentPage = null;
    }
  }

  destroy(): void {
    void this.cancel();
  }
}
