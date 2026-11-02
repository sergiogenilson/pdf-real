import { describe, expect, it } from 'vitest';
import { analyzeVisibility } from './VisibilityAnalyzer';
import type { PageTextContent } from './TextExtractor';
import type { PageGraphicsAnalysis } from './GraphicsAnalyzer';

describe('analyzeVisibility', () => {
  it('marca Tr 3 como invisible_text_mode', () => {
    const textPage: PageTextContent = {
      page: 1,
      pageWidth: 612,
      pageHeight: 792,
      items: [
        {
          id: 'p1-t0',
          page: 1,
          str: 'secret instruction',
          dir: 'ltr',
          transform: [12, 0, 0, 12, 72, 700],
          width: 120,
          height: 12,
          fontName: 'F1',
          fontSize: 12,
          bbox: { x: 72, y: 688, width: 120, height: 12 },
          hasEOL: false,
        },
      ],
    };

    const graphics: PageGraphicsAnalysis = {
      page: 1,
      pageWidth: 612,
      pageHeight: 792,
      textOps: [
        {
          text: 'secret instruction',
          page: 1,
          x: 72,
          y: 700,
          fontSize: 12,
          bbox: { x: 72, y: 688, width: 120, height: 12 },
          state: {
            fillColor: { r: 0, g: 0, b: 0, space: 'rgb', unknown: false },
            strokeColor: { r: 0, g: 0, b: 0, space: 'rgb', unknown: false },
            fillAlpha: 1,
            strokeAlpha: 1,
            textRenderingMode: 3,
            fontSize: 12,
            fontName: 'F1',
            hScale: 100,
            ctm: [1, 0, 0, 1, 0, 0],
            textMatrix: [1, 0, 0, 1, 72, 700],
            lineMatrix: [1, 0, 0, 1, 72, 700],
          },
        },
      ],
      paintedRegions: [],
      usedSpecialColorSpace: false,
    };

    const { findings } = analyzeVisibility(textPage, graphics);
    expect(findings.some((f) => f.category === 'invisible_text_mode')).toBe(true);
  });

  it('marca texto branco sobre fundo branco assumido', () => {
    const textPage: PageTextContent = {
      page: 1,
      pageWidth: 612,
      pageHeight: 792,
      items: [
        {
          id: 'p1-t0',
          page: 1,
          str: 'hidden',
          dir: 'ltr',
          transform: [12, 0, 0, 12, 72, 700],
          width: 40,
          height: 12,
          fontName: 'F1',
          fontSize: 12,
          bbox: { x: 72, y: 688, width: 40, height: 12 },
          hasEOL: false,
        },
      ],
    };

    const graphics: PageGraphicsAnalysis = {
      page: 1,
      pageWidth: 612,
      pageHeight: 792,
      textOps: [
        {
          text: 'hidden',
          page: 1,
          x: 72,
          y: 700,
          fontSize: 12,
          bbox: { x: 72, y: 688, width: 40, height: 12 },
          state: {
            fillColor: { r: 1, g: 1, b: 1, space: 'rgb', unknown: false },
            strokeColor: { r: 1, g: 1, b: 1, space: 'rgb', unknown: false },
            fillAlpha: 1,
            strokeAlpha: 1,
            textRenderingMode: 0,
            fontSize: 12,
            fontName: 'F1',
            hScale: 100,
            ctm: [1, 0, 0, 1, 0, 0],
            textMatrix: [1, 0, 0, 1, 72, 700],
            lineMatrix: [1, 0, 0, 1, 72, 700],
          },
        },
      ],
      paintedRegions: [],
      usedSpecialColorSpace: false,
    };

    const { findings } = analyzeVisibility(textPage, graphics);
    expect(findings.some((f) => f.category === 'low_contrast')).toBe(true);
  });
});
