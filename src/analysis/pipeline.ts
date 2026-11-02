import type { PDFDocumentProxy } from 'pdfjs-dist';
import type {
  AnalysisProgress,
  AnalysisReport,
  Finding,
} from '../types/findings';
import { analyzePageGraphics } from './GraphicsAnalyzer';
import { analyzeMetadata } from './MetadataAnalyzer';
import { destroyPdf, loadPdf } from './PDFLoader';
import { analyzePromptInjection } from './PromptInjectionAnalyzer';
import { evaluateRisk } from './RiskEvaluator';
import { extractPageText } from './TextExtractor';
import { analyzeUnicode } from './UnicodeAnalyzer';
import { analyzeVisibility } from './VisibilityAnalyzer';

export type ProgressCallback = (progress: AnalysisProgress) => void;

export interface AnalyzeOptions {
  fileName: string;
  fileSize: number;
  data: ArrayBuffer | Uint8Array;
  password?: string;
  onProgress?: ProgressCallback;
}

/**
 * Pipeline completo de análise local.
 * Processa páginas sequencialmente para limitar uso de memória.
 */
export async function analyzePdf(options: AnalyzeOptions): Promise<AnalysisReport> {
  const { fileName, fileSize, data, password, onProgress } = options;

  const reportProgress = (partial: Partial<AnalysisProgress> & Pick<AnalysisProgress, 'phase' | 'message'>) => {
    onProgress?.({
      currentPage: 0,
      totalPages: 0,
      ...partial,
    });
  };

  reportProgress({ phase: 'loading', message: 'Carregando documento…' });

  let document: PDFDocumentProxy | null = null;

  try {
    const loaded = await loadPdf(data, password);
    document = loaded.document;
    const pageCount = loaded.pageCount;

    const allFindings: Finding[] = [];
    let specialColorSpaces = false;
    let hasImageOnlyPages = false;
    let uncertainOcclusion = false;

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
      onProgress?.({
        phase: 'extracting',
        currentPage: pageNumber,
        totalPages: pageCount,
        message: `Extraindo página ${pageNumber} de ${pageCount}…`,
      });

      const page = await document.getPage(pageNumber);
      const textPage = await extractPageText(page, pageNumber);
      const graphics = await analyzePageGraphics(page, pageNumber);

      onProgress?.({
        phase: 'analyzing',
        currentPage: pageNumber,
        totalPages: pageCount,
        message: `Analisando página ${pageNumber} de ${pageCount}…`,
      });

      const visibility = analyzeVisibility(textPage, graphics);
      specialColorSpaces = specialColorSpaces || visibility.specialColorSpaces;
      if (visibility.findings.some((f) => f.category === 'occlusion')) {
        uncertainOcclusion = true;
      }

      const unicodeFindings = analyzeUnicode(textPage);

      const hiddenIds = new Set<string>();
      for (const f of [...visibility.findings, ...unicodeFindings]) {
        if (
          f.visibility === 'invisible' ||
          f.visibility === 'transparent' ||
          f.visibility === 'low_contrast' ||
          f.visibility === 'off_page' ||
          f.visibility === 'tiny' ||
          f.visibility === 'occluded'
        ) {
          // mapear por texto/bbox aproximado aos items
          for (const item of textPage.items) {
            if (item.str === f.text || (f.bbox && boxesNear(item.bbox, f.bbox))) {
              hiddenIds.add(item.id);
            }
          }
        }
      }

      const injectionFindings = analyzePromptInjection(textPage, hiddenIds);

      allFindings.push(
        ...visibility.findings,
        ...unicodeFindings,
        ...injectionFindings,
      );

      if (textPage.items.length === 0) {
        // página sem texto extraível — possível scan
        const hasImages = graphics.paintedRegions.some((r) => r.kind === 'image');
        if (hasImages) {
          hasImageOnlyPages = true;
        }
      }

      try {
        page.cleanup();
      } catch {
        // ignore
      }
    }

    reportProgress({
      phase: 'analyzing',
      message: 'Inspecionando metadados…',
      currentPage: pageCount,
      totalPages: pageCount,
    });

    const metaFindings = await analyzeMetadata(document);
    allFindings.push(...metaFindings);

    if (hasImageOnlyPages) {
      allFindings.push({
        id: 'limit-ocr',
        page: 0,
        text: '',
        category: 'limitation',
        reason:
          'Uma ou mais páginas parecem conter apenas imagens (possível PDF escaneado). OCR não está implementado nesta versão; texto embutido em imagens não foi analisado.',
        bbox: null,
        visibility: 'unknown',
        confidence: 'medium',
        severity: 'info',
        evidence: { ocrNotImplemented: true },
      });
    }

    reportProgress({
      phase: 'evaluating',
      message: 'Classificando risco…',
      currentPage: pageCount,
      totalPages: pageCount,
    });

    const report = evaluateRisk({
      fileName,
      fileSize,
      pageCount,
      findings: allFindings,
      limitations: {
        ocrNotImplemented: true,
        optionalContentGroups: false,
        specialColorSpaces,
        uncertainOcclusion,
        notes: [
          'Cores de fundo são assumidas como brancas quando não amostradas do canvas.',
          'getTextContent() não fornece cor/alpha/Tr; esses dados vêm de getOperatorList().',
          'Camadas opcionais (OCG) não são totalmente avaliadas nesta versão.',
        ],
      },
    });

    onProgress?.({
      phase: 'done',
      currentPage: pageCount,
      totalPages: pageCount,
      message: 'Análise concluída.',
    });

    return report;
  } catch (error) {
    onProgress?.({
      phase: 'error',
      currentPage: 0,
      totalPages: 0,
      message: error instanceof Error ? error.message : 'Erro na análise.',
    });
    throw error;
  } finally {
    await destroyPdf(document);
  }
}

function boxesNear(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) < 20;
}
