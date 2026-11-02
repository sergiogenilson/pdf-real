import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { AnalysisReport, Finding } from '../types/findings';

/** Exporta relatório JSON sem o conteúdo integral do documento. */
export function exportReportJson(report: AnalysisReport): Blob {
  const payload = {
    tool: 'pdf-real',
    version: 1,
    fileName: report.fileName,
    fileSize: report.fileSize,
    analyzedAt: report.analyzedAt,
    pageCount: report.pageCount,
    overallRisk: report.overallRisk,
    suspiciousElementCount: report.suspiciousElementCount,
    promptInjectionCount: report.promptInjectionCount,
    categories: report.categories,
    limitations: report.limitations,
    disclaimer: report.disclaimer,
    findings: report.findings.map(serializeFinding),
  };

  return new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
}

function serializeFinding(f: Finding) {
  return {
    id: f.id,
    page: f.page,
    text: f.text.slice(0, 500),
    category: f.category,
    reason: f.reason,
    bbox: f.bbox,
    visibility: f.visibility,
    confidence: f.confidence,
    severity: f.severity,
    evidence: f.evidence,
  };
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadReportJson(report: AnalysisReport): void {
  const base = report.fileName.replace(/\.pdf$/i, '') || 'relatorio';
  downloadBlob(exportReportJson(report), `${base}-pdf-real.json`);
}

/**
 * Gera PDF de relatório no cliente (pdf-lib).
 * Inclui apenas trechos das ocorrências, não o documento original.
 */
export async function exportReportPdf(report: AnalysisReport): Promise<Blob> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([595, 842]);
  let y = 800;
  const margin = 50;
  const maxWidth = 495;

  const draw = (text: string, size: number, useBold = false, color = rgb(0.1, 0.1, 0.12)) => {
    const f = useBold ? bold : font;
    const lines = wrapText(text, f, size, maxWidth);
    for (const line of lines) {
      if (y < 60) {
        page = doc.addPage([595, 842]);
        y = 800;
      }
      page.drawText(line, { x: margin, y, size, font: f, color });
      y -= size + 4;
    }
  };

  draw('pdf-real — Relatório de Análise', 16, true);
  y -= 8;
  draw(`Arquivo: ${report.fileName}`, 11);
  draw(`Analisado em: ${report.analyzedAt}`, 10);
  draw(`Páginas: ${report.pageCount}`, 10);
  draw(`Risco geral: ${report.overallRisk}`, 11, true);
  draw(`Elementos suspeitos: ${report.suspiciousElementCount}`, 10);
  draw(`Possíveis prompt injections: ${report.promptInjectionCount}`, 10);
  y -= 10;
  draw(report.disclaimer, 9, false, rgb(0.35, 0.25, 0.1));
  y -= 14;
  draw('Ocorrências', 13, true);
  y -= 6;

  const findings = report.findings.filter((f) => f.category !== 'limitation');
  if (findings.length === 0) {
    draw('Nenhuma ocorrência técnica registrada. Isso não implica segurança.', 10);
  } else {
    for (const f of findings.slice(0, 80)) {
      draw(
        `[${f.severity.toUpperCase()}] p.${f.page} · ${f.category} · confiança ${f.confidence}`,
        10,
        true,
      );
      draw(f.reason, 9);
      if (f.text) draw(`Trecho: ${f.text.slice(0, 180)}`, 9, false, rgb(0.25, 0.25, 0.3));
      if (f.bbox) {
        draw(
          `BBox: x=${f.bbox.x.toFixed(1)} y=${f.bbox.y.toFixed(1)} w=${f.bbox.width.toFixed(1)} h=${f.bbox.height.toFixed(1)}`,
          8,
          false,
          rgb(0.4, 0.4, 0.45),
        );
      }
      y -= 8;
    }
    if (findings.length > 80) {
      draw(`… e mais ${findings.length - 80} ocorrências (veja o JSON).`, 9);
    }
  }

  const bytes = await doc.save();
  const copy = new Uint8Array(bytes);
  return new Blob([copy], { type: 'application/pdf' });
}

export async function downloadReportPdf(report: AnalysisReport): Promise<void> {
  const blob = await exportReportPdf(report);
  const base = report.fileName.replace(/\.pdf$/i, '') || 'relatorio';
  downloadBlob(blob, `${base}-pdf-real.pdf`);
}

function wrapText(
  text: string,
  font: { widthOfTextAtSize: (t: string, s: number) => number },
  size: number,
  maxWidth: number,
): string[] {
  const safe = text.replace(/\s+/g, ' ').trim();
  if (!safe) return [''];
  const words = safe.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const trial = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(trial, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = trial;
    }
  }
  if (current) lines.push(current);
  return lines;
}
