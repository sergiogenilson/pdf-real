import type { PDFPageProxy } from 'pdfjs-dist';
import type { BoundingBox } from '../types/findings';

export interface TextItem {
  id: string;
  page: number;
  str: string;
  dir: string;
  transform: number[];
  width: number;
  height: number;
  fontName: string;
  /** Tamanho efetivo estimado a partir da matriz de transformação. */
  fontSize: number;
  bbox: BoundingBox;
  hasEOL: boolean;
}

export interface PageTextContent {
  page: number;
  pageWidth: number;
  pageHeight: number;
  items: TextItem[];
}

function matrixScale(transform: number[]): number {
  // escala horizontal aproximada a partir de [a,b,c,d,e,f]
  const sx = Math.hypot(transform[0], transform[1]);
  const sy = Math.hypot(transform[2], transform[3]);
  return Math.max(sx, sy);
}

function itemBBox(transform: number[], width: number, height: number): BoundingBox {
  const x = transform[4];
  const y = transform[5];
  const fontSize = matrixScale(transform);
  const h = height > 0 ? height : fontSize;
  const w = width > 0 ? width : fontSize * 0.5;
  return { x, y: y - h * 0.15, width: w, height: h };
}

/**
 * Extrai texto e posicionamento de uma página.
 * Não assume que a ordem dos itens corresponde à ordem visual.
 */
export async function extractPageText(
  page: PDFPageProxy,
  pageNumber: number,
): Promise<PageTextContent> {
  const view = page.view;
  const pageWidth = view[2] - view[0];
  const pageHeight = view[3] - view[1];

  const content = await page.getTextContent({
    includeMarkedContent: false,
  });

  const items: TextItem[] = [];
  let index = 0;

  for (const raw of content.items) {
    if (!('str' in raw)) continue;
    const str = raw.str ?? '';
    if (str.length === 0) continue;

    const transform = Array.from(raw.transform ?? [1, 0, 0, 1, 0, 0]);
    const fontSize = matrixScale(transform);
    const width = typeof raw.width === 'number' ? raw.width : 0;
    const height = typeof raw.height === 'number' ? raw.height : fontSize;

    items.push({
      id: `p${pageNumber}-t${index}`,
      page: pageNumber,
      str,
      dir: raw.dir ?? 'ltr',
      transform,
      width,
      height,
      fontName: raw.fontName ?? 'unknown',
      fontSize,
      bbox: itemBBox(transform, width, height),
      hasEOL: Boolean(raw.hasEOL),
    });
    index += 1;
  }

  return { page: pageNumber, pageWidth, pageHeight, items };
}
