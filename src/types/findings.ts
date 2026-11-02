/** Severidade de uma ocorrência. */
export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';

/** Quão visível o conteúdo parece ser para um leitor humano. */
export type Visibility =
  | 'visible'
  | 'low_contrast'
  | 'transparent'
  | 'invisible'
  | 'off_page'
  | 'tiny'
  | 'occluded'
  | 'unknown';

/** Confiança técnica da detecção (não do risco). */
export type Confidence = 'low' | 'medium' | 'high';

export type FindingCategory =
  | 'low_contrast'
  | 'transparency'
  | 'invisible_text_mode'
  | 'suspicious_size'
  | 'off_page'
  | 'occlusion'
  | 'invisible_unicode'
  | 'prompt_injection'
  | 'metadata'
  | 'limitation';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Finding {
  id: string;
  page: number;
  text: string;
  category: FindingCategory;
  reason: string;
  bbox: BoundingBox | null;
  visibility: Visibility;
  confidence: Confidence;
  severity: Severity;
  /** Evidência técnica reproduzível (ops, valores medidos, etc.). */
  evidence: Record<string, unknown>;
}

export interface CategorySummary {
  category: FindingCategory;
  count: number;
}

export interface AnalysisLimitations {
  ocrNotImplemented: boolean;
  optionalContentGroups: boolean;
  specialColorSpaces: boolean;
  uncertainOcclusion: boolean;
  notes: string[];
}

export interface AnalysisReport {
  fileName: string;
  fileSize: number;
  analyzedAt: string;
  pageCount: number;
  findings: Finding[];
  suspiciousElementCount: number;
  promptInjectionCount: number;
  categories: CategorySummary[];
  overallRisk: Severity;
  limitations: AnalysisLimitations;
  disclaimer: string;
}

export interface AnalysisProgress {
  phase: 'loading' | 'extracting' | 'analyzing' | 'evaluating' | 'done' | 'error';
  currentPage: number;
  totalPages: number;
  message: string;
}

export const ANALYSIS_DISCLAIMER =
  'A ausência de ocorrências não significa que o documento seja seguro. Esta análise tem limitações técnicas (PDF.js, espaços de cor especiais, camadas opcionais, OCR não implementado) e não substitui revisão humana.';
