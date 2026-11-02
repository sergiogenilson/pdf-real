import {
  ANALYSIS_DISCLAIMER,
  type AnalysisLimitations,
  type AnalysisReport,
  type CategorySummary,
  type Finding,
  type FindingCategory,
  type Severity,
} from '../types/findings';

const SEVERITY_ORDER: Severity[] = ['info', 'low', 'medium', 'high', 'critical'];

function maxSeverity(a: Severity, b: Severity): Severity {
  return SEVERITY_ORDER.indexOf(a) >= SEVERITY_ORDER.indexOf(b) ? a : b;
}

function summarizeCategories(findings: Finding[]): CategorySummary[] {
  const map = new Map<FindingCategory, number>();
  for (const f of findings) {
    map.set(f.category, (map.get(f.category) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Agrega achados em um relatório de risco.
 * Nunca declara o documento como "seguro".
 */
export function evaluateRisk(input: {
  fileName: string;
  fileSize: number;
  pageCount: number;
  findings: Finding[];
  limitations: Partial<AnalysisLimitations>;
}): AnalysisReport {
  const findings = [...input.findings].sort(
    (a, b) =>
      SEVERITY_ORDER.indexOf(b.severity) - SEVERITY_ORDER.indexOf(a.severity) ||
      a.page - b.page,
  );

  let overall: Severity = 'info';
  for (const f of findings) {
    if (f.category === 'limitation') continue;
    overall = maxSeverity(overall, f.severity);
  }

  // Sem achados reais → risco informativo (não "seguro")
  if (findings.every((f) => f.category === 'limitation') || findings.length === 0) {
    overall = 'info';
  }

  const promptInjectionCount = findings.filter(
    (f) => f.category === 'prompt_injection',
  ).length;

  const suspiciousElementCount = findings.filter(
    (f) =>
      f.category !== 'limitation' &&
      f.category !== 'prompt_injection' &&
      f.severity !== 'info',
  ).length;

  const notes = [
    ...(input.limitations.notes ?? []),
    ANALYSIS_DISCLAIMER,
  ];

  const limitations: AnalysisLimitations = {
    ocrNotImplemented: input.limitations.ocrNotImplemented ?? true,
    optionalContentGroups: input.limitations.optionalContentGroups ?? false,
    specialColorSpaces: input.limitations.specialColorSpaces ?? false,
    uncertainOcclusion: input.limitations.uncertainOcclusion ?? true,
    notes: [...new Set(notes)],
  };

  return {
    fileName: input.fileName,
    fileSize: input.fileSize,
    analyzedAt: new Date().toISOString(),
    pageCount: input.pageCount,
    findings,
    suspiciousElementCount,
    promptInjectionCount,
    categories: summarizeCategories(findings),
    overallRisk: overall,
    limitations,
    disclaimer: ANALYSIS_DISCLAIMER,
  };
}
