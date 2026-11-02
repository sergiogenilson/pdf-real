import { describe, expect, it } from 'vitest';
import { analyzeUnicode } from './UnicodeAnalyzer';
import type { PageTextContent } from './TextExtractor';

function pageWith(str: string): PageTextContent {
  return {
    page: 1,
    pageWidth: 612,
    pageHeight: 792,
    items: [
      {
        id: 'p1-t0',
        page: 1,
        str,
        dir: 'ltr',
        transform: [12, 0, 0, 12, 72, 700],
        width: 100,
        height: 12,
        fontName: 'Helv',
        fontSize: 12,
        bbox: { x: 72, y: 688, width: 100, height: 12 },
        hasEOL: false,
      },
    ],
  };
}

describe('analyzeUnicode', () => {
  it('detecta zero-width space', () => {
    const findings = analyzeUnicode(pageWith(`abc\u200Bdef`));
    expect(findings.length).toBe(1);
    expect(findings[0].category).toBe('invisible_unicode');
  });

  it('não marca texto normal', () => {
    const findings = analyzeUnicode(pageWith('Texto normal sem truques.'));
    expect(findings.length).toBe(0);
  });
});
