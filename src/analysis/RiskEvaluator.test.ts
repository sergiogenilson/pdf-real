import { describe, expect, it } from 'vitest';
import { evaluateRisk } from './RiskEvaluator';
import type { Finding } from '../types/findings';

const baseFinding = (partial: Partial<Finding>): Finding => ({
  id: 'f1',
  page: 1,
  text: 'x',
  category: 'low_contrast',
  reason: 'teste',
  bbox: null,
  visibility: 'low_contrast',
  confidence: 'medium',
  severity: 'high',
  evidence: {},
  ...partial,
});

describe('evaluateRisk', () => {
  it('não declara documento seguro quando não há findings', () => {
    const report = evaluateRisk({
      fileName: 'clean.pdf',
      fileSize: 100,
      pageCount: 1,
      findings: [],
      limitations: { ocrNotImplemented: true, notes: [] },
    });
    expect(report.overallRisk).toBe('info');
    expect(report.disclaimer.length).toBeGreaterThan(20);
  });

  it('agrega severidade máxima', () => {
    const report = evaluateRisk({
      fileName: 'a.pdf',
      fileSize: 10,
      pageCount: 2,
      findings: [
        baseFinding({ severity: 'low', id: 'a' }),
        baseFinding({
          severity: 'critical',
          id: 'b',
          category: 'prompt_injection',
        }),
      ],
      limitations: {},
    });
    expect(report.overallRisk).toBe('critical');
    expect(report.promptInjectionCount).toBe(1);
  });
});
