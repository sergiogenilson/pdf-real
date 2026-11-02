import { OPS } from 'pdfjs-dist';
import type { PDFPageProxy } from 'pdfjs-dist';
import type { BoundingBox } from '../types/findings';

export type ColorSpace = 'rgb' | 'gray' | 'cmyk' | 'unknown';

export interface RgbColor {
  r: number;
  g: number;
  b: number;
  space: ColorSpace;
  /** true quando o espaço de cor não pôde ser convertido com confiança. */
  unknown: boolean;
}

export interface GraphicsStateSnapshot {
  fillColor: RgbColor;
  strokeColor: RgbColor;
  fillAlpha: number;
  strokeAlpha: number;
  textRenderingMode: number;
  fontSize: number;
  fontName: string;
  hScale: number;
  ctm: number[];
  textMatrix: number[];
  lineMatrix: number[];
}

export interface TextOpRecord {
  text: string;
  page: number;
  state: GraphicsStateSnapshot;
  /** Origem aproximada em coordenadas de usuário (após CTM). */
  x: number;
  y: number;
  fontSize: number;
  bbox: BoundingBox | null;
}

export interface PaintedRegion {
  kind: 'rect' | 'image' | 'path';
  bbox: BoundingBox;
  fillColor: RgbColor;
  fillAlpha: number;
  /** Índice no operator list — maior = pintado depois (pode cobrir texto). */
  order: number;
}

export interface PageGraphicsAnalysis {
  page: number;
  pageWidth: number;
  pageHeight: number;
  textOps: TextOpRecord[];
  paintedRegions: PaintedRegion[];
  usedSpecialColorSpace: boolean;
}

function identity(): number[] {
  return [1, 0, 0, 1, 0, 0];
}

function multiply(m1: number[], m2: number[]): number[] {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

function applyMatrix(m: number[], x: number, y: number): { x: number; y: number } {
  return {
    x: m[0] * x + m[2] * y + m[4],
    y: m[1] * x + m[3] * y + m[5],
  };
}

function cloneState(s: GraphicsStateSnapshot): GraphicsStateSnapshot {
  return {
    fillColor: { ...s.fillColor },
    strokeColor: { ...s.strokeColor },
    fillAlpha: s.fillAlpha,
    strokeAlpha: s.strokeAlpha,
    textRenderingMode: s.textRenderingMode,
    fontSize: s.fontSize,
    fontName: s.fontName,
    hScale: s.hScale,
    ctm: [...s.ctm],
    textMatrix: [...s.textMatrix],
    lineMatrix: [...s.lineMatrix],
  };
}

function defaultState(): GraphicsStateSnapshot {
  return {
    fillColor: { r: 0, g: 0, b: 0, space: 'rgb', unknown: false },
    strokeColor: { r: 0, g: 0, b: 0, space: 'rgb', unknown: false },
    fillAlpha: 1,
    strokeAlpha: 1,
    textRenderingMode: 0,
    fontSize: 12,
    fontName: '',
    hScale: 100,
    ctm: identity(),
    textMatrix: identity(),
    lineMatrix: identity(),
  };
}

function cmykToRgb(c: number, m: number, y: number, k: number): RgbColor {
  return {
    r: 1 - Math.min(1, c * (1 - k) + k),
    g: 1 - Math.min(1, m * (1 - k) + k),
    b: 1 - Math.min(1, y * (1 - k) + k),
    space: 'cmyk',
    unknown: false,
  };
}

function glyphToChar(part: unknown): string {
  if (typeof part === 'string') return part;
  if (typeof part === 'number') return '';
  if (part && typeof part === 'object' && 'unicode' in part) {
    const unicode = (part as { unicode?: string }).unicode;
    return typeof unicode === 'string' ? unicode : '';
  }
  return '';
}

function decodeShowTextArg(arg: unknown): string {
  if (typeof arg === 'string') return arg;
  if (arg instanceof Uint8Array) {
    try {
      return new TextDecoder('utf-8').decode(arg);
    } catch {
      return '';
    }
  }
  if (Array.isArray(arg)) {
    // PDF.js moderno entrega arrays de glifos ({ unicode, fontChar, width... })
    return arg.map(glyphToChar).join('');
  }
  return '';
}

/**
 * Analisa getOperatorList() e reconstrói estados gráficos relevantes
 * para cada operação de texto e regiões pintadas (oclusão).
 */
export async function analyzePageGraphics(
  page: PDFPageProxy,
  pageNumber: number,
): Promise<PageGraphicsAnalysis> {
  const view = page.view;
  const pageWidth = view[2] - view[0];
  const pageHeight = view[3] - view[1];

  const opList = await page.getOperatorList({ intent: 'display' });
  const { fnArray, argsArray } = opList;

  let state = defaultState();
  const stack: GraphicsStateSnapshot[] = [];
  const textOps: TextOpRecord[] = [];
  const paintedRegions: PaintedRegion[] = [];
  let usedSpecialColorSpace = false;

  let pathMinX = Infinity;
  let pathMinY = Infinity;
  let pathMaxX = -Infinity;
  let pathMaxY = -Infinity;
  let hasPath = false;

  const trackPoint = (x: number, y: number) => {
    const p = applyMatrix(state.ctm, x, y);
    pathMinX = Math.min(pathMinX, p.x);
    pathMinY = Math.min(pathMinY, p.y);
    pathMaxX = Math.max(pathMaxX, p.x);
    pathMaxY = Math.max(pathMaxY, p.y);
    hasPath = true;
  };

  const resetPath = () => {
    pathMinX = Infinity;
    pathMinY = Infinity;
    pathMaxX = -Infinity;
    pathMaxY = -Infinity;
    hasPath = false;
  };

  const pushPathRegion = (kind: PaintedRegion['kind'], order: number) => {
    if (!hasPath) return;
    paintedRegions.push({
      kind,
      bbox: {
        x: pathMinX,
        y: pathMinY,
        width: Math.max(0, pathMaxX - pathMinX),
        height: Math.max(0, pathMaxY - pathMinY),
      },
      fillColor: { ...state.fillColor },
      fillAlpha: state.fillAlpha,
      order,
    });
    resetPath();
  };

  const recordText = (rawText: string, order: number) => {
    void order;
    const text = rawText;
    if (!text) return;

    const combined = multiply(state.ctm, state.textMatrix);
    const origin = applyMatrix(combined, 0, 0);
    const fontSize =
      Math.hypot(combined[0], combined[1]) * Math.abs(state.fontSize || 1) ||
      Math.abs(state.fontSize);

    const approxWidth = text.length * fontSize * 0.5 * (state.hScale / 100);
    textOps.push({
      text,
      page: pageNumber,
      state: cloneState(state),
      x: origin.x,
      y: origin.y,
      fontSize,
      bbox: {
        x: origin.x,
        y: origin.y - fontSize * 0.2,
        width: approxWidth,
        height: fontSize,
      },
    });
  };

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = (argsArray[i] ?? []) as unknown[];

    switch (fn) {
      case OPS.save:
        stack.push(cloneState(state));
        break;
      case OPS.restore:
        state = stack.pop() ?? defaultState();
        break;
      case OPS.transform:
        if (args.length >= 6) {
          state.ctm = multiply(state.ctm, args as number[]);
        }
        break;
      case OPS.setGState: {
        const pairs = args[0] as unknown;
        if (Array.isArray(pairs)) {
          for (let p = 0; p < pairs.length; p += 2) {
            const key = pairs[p];
            const value = pairs[p + 1];
            if (key === 'ca' && typeof value === 'number') state.fillAlpha = value;
            if (key === 'CA' && typeof value === 'number') state.strokeAlpha = value;
          }
        }
        break;
      }
      case OPS.setFillRGBColor:
        state.fillColor = {
          r: Number(args[0]) || 0,
          g: Number(args[1]) || 0,
          b: Number(args[2]) || 0,
          space: 'rgb',
          unknown: false,
        };
        break;
      case OPS.setStrokeRGBColor:
        state.strokeColor = {
          r: Number(args[0]) || 0,
          g: Number(args[1]) || 0,
          b: Number(args[2]) || 0,
          space: 'rgb',
          unknown: false,
        };
        break;
      case OPS.setFillGray: {
        const g = Number(args[0]) || 0;
        state.fillColor = { r: g, g, b: g, space: 'gray', unknown: false };
        break;
      }
      case OPS.setStrokeGray: {
        const g = Number(args[0]) || 0;
        state.strokeColor = { r: g, g, b: g, space: 'gray', unknown: false };
        break;
      }
      case OPS.setFillCMYKColor:
        state.fillColor = cmykToRgb(
          Number(args[0]) || 0,
          Number(args[1]) || 0,
          Number(args[2]) || 0,
          Number(args[3]) || 0,
        );
        break;
      case OPS.setStrokeCMYKColor:
        state.strokeColor = cmykToRgb(
          Number(args[0]) || 0,
          Number(args[1]) || 0,
          Number(args[2]) || 0,
          Number(args[3]) || 0,
        );
        break;
      case OPS.setFillColorSpace:
      case OPS.setStrokeColorSpace:
        usedSpecialColorSpace = true;
        break;
      case OPS.setFillColor:
      case OPS.setStrokeColor:
      case OPS.setFillColorN:
      case OPS.setStrokeColorN:
        usedSpecialColorSpace = true;
        if (fn === OPS.setFillColor || fn === OPS.setFillColorN) {
          state.fillColor = { r: 0, g: 0, b: 0, space: 'unknown', unknown: true };
        } else {
          state.strokeColor = { r: 0, g: 0, b: 0, space: 'unknown', unknown: true };
        }
        break;
      case OPS.setFont:
        state.fontName = String(args[0] ?? '');
        state.fontSize = Number(args[1]) || state.fontSize;
        break;
      case OPS.setTextRenderingMode:
        state.textRenderingMode = Number(args[0]) || 0;
        break;
      case OPS.setHScale:
        state.hScale = Number(args[0]) || 100;
        break;
      case OPS.beginText:
        state.textMatrix = identity();
        state.lineMatrix = identity();
        break;
      case OPS.endText:
        break;
      case OPS.setTextMatrix:
        if (args.length >= 6) {
          state.textMatrix = args as number[];
          state.lineMatrix = [...state.textMatrix];
        }
        break;
      case OPS.moveText: {
        const tx = Number(args[0]) || 0;
        const ty = Number(args[1]) || 0;
        state.lineMatrix = multiply(state.lineMatrix, [1, 0, 0, 1, tx, ty]);
        state.textMatrix = [...state.lineMatrix];
        break;
      }
      case OPS.nextLine:
        state.lineMatrix = multiply(state.lineMatrix, [1, 0, 0, 1, 0, -state.fontSize]);
        state.textMatrix = [...state.lineMatrix];
        break;
      case OPS.showText:
        recordText(decodeShowTextArg(args[0]), i);
        break;
      case OPS.showSpacedText: {
        const arr = args[0];
        if (Array.isArray(arr)) {
          recordText(arr.map(glyphToChar).join(''), i);
        }
        break;
      }
      case OPS.nextLineShowText:
        state.lineMatrix = multiply(state.lineMatrix, [1, 0, 0, 1, 0, -state.fontSize]);
        state.textMatrix = [...state.lineMatrix];
        recordText(decodeShowTextArg(args[0]), i);
        break;
      case OPS.nextLineSetSpacingShowText:
        state.lineMatrix = multiply(state.lineMatrix, [1, 0, 0, 1, 0, -state.fontSize]);
        state.textMatrix = [...state.lineMatrix];
        recordText(decodeShowTextArg(args[2] ?? args[0]), i);
        break;
      case OPS.moveTo:
      case OPS.lineTo:
        trackPoint(Number(args[0]) || 0, Number(args[1]) || 0);
        break;
      case OPS.curveTo:
        trackPoint(Number(args[4]) || 0, Number(args[5]) || 0);
        break;
      case OPS.rectangle: {
        const x = Number(args[0]) || 0;
        const y = Number(args[1]) || 0;
        const w = Number(args[2]) || 0;
        const h = Number(args[3]) || 0;
        trackPoint(x, y);
        trackPoint(x + w, y + h);
        break;
      }
      case OPS.fill:
      case OPS.eoFill:
      case OPS.fillStroke:
      case OPS.eoFillStroke:
      case OPS.closeFillStroke:
      case OPS.closeEOFillStroke:
        pushPathRegion('rect', i);
        break;
      case OPS.stroke:
      case OPS.closeStroke:
        resetPath();
        break;
      case OPS.paintImageXObject:
      case OPS.paintInlineImageXObject:
      case OPS.paintImageMaskXObject: {
        // imagem unitária transformada pelo CTM atual
        const p0 = applyMatrix(state.ctm, 0, 0);
        const p1 = applyMatrix(state.ctm, 1, 1);
        paintedRegions.push({
          kind: 'image',
          bbox: {
            x: Math.min(p0.x, p1.x),
            y: Math.min(p0.y, p1.y),
            width: Math.abs(p1.x - p0.x),
            height: Math.abs(p1.y - p0.y),
          },
          fillColor: { r: 0, g: 0, b: 0, space: 'unknown', unknown: true },
          fillAlpha: state.fillAlpha,
          order: i,
        });
        break;
      }
      default:
        break;
    }
  }

  return {
    page: pageNumber,
    pageWidth,
    pageHeight,
    textOps,
    paintedRegions,
    usedSpecialColorSpace,
  };
}

/**
 * Associa um TextItem extraído a um TextOpRecord por similaridade de string e posição.
 */
export function correlateTextItem(
  str: string,
  bbox: BoundingBox,
  textOps: TextOpRecord[],
): TextOpRecord | null {
  const normalized = str.replace(/\s+/g, ' ').trim();
  if (!normalized || textOps.length === 0) return null;

  let best: TextOpRecord | null = null;
  let bestScore = Infinity;

  for (const op of textOps) {
    const opText = op.text.replace(/\s+/g, ' ').trim();
    if (!opText) continue;

    const contains =
      opText.includes(normalized) ||
      normalized.includes(opText) ||
      opText === normalized;
    if (!contains && Math.abs(opText.length - normalized.length) > 4) continue;

    const dx = (op.x ?? 0) - bbox.x;
    const dy = (op.y ?? 0) - bbox.y;
    const dist = Math.hypot(dx, dy);
    const score = contains ? dist : dist + 50;
    if (score < bestScore) {
      bestScore = score;
      best = op;
    }
  }

  return bestScore < 120 ? best : null;
}
