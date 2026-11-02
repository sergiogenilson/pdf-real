import type { Finding } from '../types/findings';
import type { PageTextContent, TextItem } from './TextExtractor';
import {
  correlateTextItem,
  type PageGraphicsAnalysis,
  type RgbColor,
  type TextOpRecord,
} from './GraphicsAnalyzer';

const TINY_FONT_PT = 1.5;
const LOW_ALPHA = 0.15;
const CONTRAST_THRESHOLD = 0.18;
const OFF_PAGE_MARGIN = 2;

function relativeLuminance(c: RgbColor): number {
  const lin = (v: number) => {
    const s = Math.min(1, Math.max(0, v));
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

function contrastRatio(a: RgbColor, b: RgbColor): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return !(
    a.x + a.width < b.x ||
    b.x + b.width < a.x ||
    a.y + a.height < b.y ||
    b.y + b.height < a.y
  );
}

function coverageRatio(
  text: { x: number; y: number; width: number; height: number },
  cover: { x: number; y: number; width: number; height: number },
): number {
  const x1 = Math.max(text.x, cover.x);
  const y1 = Math.max(text.y, cover.y);
  const x2 = Math.min(text.x + text.width, cover.x + cover.width);
  const y2 = Math.min(text.y + text.height, cover.y + cover.height);
  if (x2 <= x1 || y2 <= y1) return 0;
  const inter = (x2 - x1) * (y2 - y1);
  const area = Math.max(1, text.width * text.height);
  return inter / area;
}

let findingSeq = 0;
function nextId(prefix: string): string {
  findingSeq += 1;
  return `${prefix}-${findingSeq}`;
}

function assumedBackground(): RgbColor {
  // fundo padrão de página PDF / canvas branco quando não amostrado
  return { r: 1, g: 1, b: 1, space: 'rgb', unknown: false };
}

/**
 * Identifica conteúdo visualmente oculto ou suspeito.
 * Quando a evidência é ambígua, classifica como suspeita (confiança baixa).
 */
export function analyzeVisibility(
  textPage: PageTextContent,
  graphics: PageGraphicsAnalysis,
): { findings: Finding[]; specialColorSpaces: boolean } {
  const findings: Finding[] = [];
  const bg = assumedBackground();

  for (const item of textPage.items) {
    const op = correlateTextItem(item.str, item.bbox, graphics.textOps);
    findings.push(...inspectItem(item, op, graphics, bg));
  }

  // Text ops sem correspondência em getTextContent (ex.: Tr 3 às vezes omitido)
  for (const op of graphics.textOps) {
    if (op.state.textRenderingMode === 3 && op.text.trim()) {
      const already = findings.some(
        (f) =>
          f.category === 'invisible_text_mode' &&
          f.page === op.page &&
          f.text.includes(op.text.slice(0, 40)),
      );
      if (!already) {
        findings.push({
          id: nextId('tr3'),
          page: op.page,
          text: op.text.slice(0, 500),
          category: 'invisible_text_mode',
          reason:
            'Modo de renderização de texto 3 (Tr 3): o texto permanece no PDF sem ser desenhado visualmente.',
          bbox: op.bbox,
          visibility: 'invisible',
          confidence: 'high',
          severity: 'high',
          evidence: {
            textRenderingMode: 3,
            fillAlpha: op.state.fillAlpha,
            fontSize: op.fontSize,
          },
        });
      }
    }
  }

  return {
    findings,
    specialColorSpaces: graphics.usedSpecialColorSpace,
  };
}

function inspectItem(
  item: TextItem,
  op: TextOpRecord | null,
  graphics: PageGraphicsAnalysis,
  bg: RgbColor,
): Finding[] {
  const out: Finding[] = [];
  const page = item.page;
  const text = item.str.slice(0, 500);
  const bbox = item.bbox;

  // Fora da página
  const offPage =
    bbox.x + bbox.width < -OFF_PAGE_MARGIN ||
    bbox.y + bbox.height < -OFF_PAGE_MARGIN ||
    bbox.x > graphics.pageWidth + OFF_PAGE_MARGIN ||
    bbox.y > graphics.pageHeight + OFF_PAGE_MARGIN ||
    bbox.x < -OFF_PAGE_MARGIN ||
    bbox.y < -OFF_PAGE_MARGIN;

  if (offPage) {
    out.push({
      id: nextId('off'),
      page,
      text,
      category: 'off_page',
      reason: 'Texto posicionado fora dos limites visíveis da página (MediaBox).',
      bbox,
      visibility: 'off_page',
      confidence: 'high',
      severity: 'high',
      evidence: {
        bbox,
        pageWidth: graphics.pageWidth,
        pageHeight: graphics.pageHeight,
      },
    });
  }

  // Tamanho suspeito
  const fontSize = op?.fontSize ?? item.fontSize;
  const hScale = op?.state.hScale ?? 100;
  if (fontSize > 0 && fontSize < TINY_FONT_PT) {
    out.push({
      id: nextId('tiny'),
      page,
      text,
      category: 'suspicious_size',
      reason: `Fonte extremamente pequena (~${fontSize.toFixed(2)} pt).`,
      bbox,
      visibility: 'tiny',
      confidence: op ? 'high' : 'medium',
      severity: 'medium',
      evidence: { fontSize, hScale, source: op ? 'operator' : 'textContent' },
    });
  } else if (hScale > 0 && (hScale < 10 || hScale > 500)) {
    out.push({
      id: nextId('scale'),
      page,
      text,
      category: 'suspicious_size',
      reason: `Escala horizontal anormal (Tz=${hScale}).`,
      bbox,
      visibility: 'tiny',
      confidence: op ? 'medium' : 'low',
      severity: 'low',
      evidence: { hScale, fontSize },
    });
  }

  if (!op) {
    return out;
  }

  const mode = op.state.textRenderingMode;
  if (mode === 3) {
    out.push({
      id: nextId('tr3'),
      page,
      text,
      category: 'invisible_text_mode',
      reason:
        'Modo de renderização de texto 3 (Tr 3): texto presente no conteúdo, mas não desenhado.',
      bbox,
      visibility: 'invisible',
      confidence: 'high',
      severity: 'high',
      evidence: { textRenderingMode: mode },
    });
  }

  const alpha = op.state.fillAlpha;
  if (alpha <= 0.001) {
    out.push({
      id: nextId('alpha0'),
      page,
      text,
      category: 'transparency',
      reason: 'Texto com opacidade efetivamente zero (ca ≈ 0).',
      bbox,
      visibility: 'transparent',
      confidence: 'high',
      severity: 'critical',
      evidence: { fillAlpha: alpha },
    });
  } else if (alpha < LOW_ALPHA) {
    out.push({
      id: nextId('alpha'),
      page,
      text,
      category: 'transparency',
      reason: `Texto com opacidade muito baixa (ca=${alpha.toFixed(3)}).`,
      bbox,
      visibility: 'transparent',
      confidence: 'high',
      severity: 'high',
      evidence: { fillAlpha: alpha },
    });
  }

  const fill = op.state.fillColor;
  if (fill.unknown) {
    out.push({
      id: nextId('colorunk'),
      page,
      text,
      category: 'low_contrast',
      reason:
        'Espaço de cor especial ou não resolvido; contraste com o fundo não pôde ser determinado com confiança.',
      bbox,
      visibility: 'unknown',
      confidence: 'low',
      severity: 'info',
      evidence: { fillColor: fill },
    });
  } else if (mode !== 3 && alpha > 0.001) {
    // contraste vs fundo branco assumido (limitação documentada)
    const ratio = contrastRatio(fill, bg);
    const delta =
      Math.abs(fill.r - bg.r) + Math.abs(fill.g - bg.g) + Math.abs(fill.b - bg.b);
    if (ratio < 1.5 || delta < CONTRAST_THRESHOLD) {
      out.push({
        id: nextId('contrast'),
        page,
        text,
        category: 'low_contrast',
        reason:
          'Texto com baixo contraste em relação ao fundo assumido (branco). Pode ser texto branco sobre branco.',
        bbox,
        visibility: 'low_contrast',
        confidence: 'medium',
        severity: 'high',
        evidence: {
          fillColor: fill,
          assumedBackground: bg,
          contrastRatio: Number(ratio.toFixed(3)),
          note: 'Fundo assumido como branco quando não amostrado do canvas.',
        },
      });
    }
  }

  // Oclusão: regiões pintadas depois que se sobrepõem ao texto
  if (op.bbox) {
    for (const region of graphics.paintedRegions) {
      if (!overlaps(op.bbox, region.bbox)) continue;
      const cov = coverageRatio(op.bbox, region.bbox);
      if (cov < 0.4) continue;
      out.push({
        id: nextId('occ'),
        page,
        text,
        category: 'occlusion',
        reason:
          'Possível texto encoberto por forma/imagem sobreposta. Classificado como suspeita, não como certeza.',
        bbox,
        visibility: 'occluded',
        confidence: 'low',
        severity: 'medium',
        evidence: {
          coverage: Number(cov.toFixed(3)),
          coverKind: region.kind,
          coverOrder: region.order,
          note: 'Heurística geométrica; z-order aproximado pela ordem dos operadores.',
        },
      });
      break;
    }
  }

  return out;
}
