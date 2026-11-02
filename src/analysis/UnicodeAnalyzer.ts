import type { Finding } from '../types/findings';
import type { PageTextContent } from './TextExtractor';

/** Caracteres Unicode frequentemente usados para ocultar ou ofuscar texto. */
const INVISIBLE_CHARS: Array<{ code: number; name: string }> = [
  { code: 0x200b, name: 'ZERO WIDTH SPACE' },
  { code: 0x200c, name: 'ZERO WIDTH NON-JOINER' },
  { code: 0x200d, name: 'ZERO WIDTH JOINER' },
  { code: 0x2060, name: 'WORD JOINER' },
  { code: 0xfeff, name: 'ZERO WIDTH NO-BREAK SPACE / BOM' },
  { code: 0x00ad, name: 'SOFT HYPHEN' },
  { code: 0x034f, name: 'COMBINING GRAPHEME JOINER' },
  { code: 0x180e, name: 'MONGOLIAN VOWEL SEPARATOR' },
  { code: 0x200e, name: 'LEFT-TO-RIGHT MARK' },
  { code: 0x200f, name: 'RIGHT-TO-LEFT MARK' },
  { code: 0x202a, name: 'LEFT-TO-RIGHT EMBEDDING' },
  { code: 0x202b, name: 'RIGHT-TO-LEFT EMBEDDING' },
  { code: 0x202c, name: 'POP DIRECTIONAL FORMATTING' },
  { code: 0x202d, name: 'LEFT-TO-RIGHT OVERRIDE' },
  { code: 0x202e, name: 'RIGHT-TO-LEFT OVERRIDE' },
  { code: 0x2066, name: 'LEFT-TO-RIGHT ISOLATE' },
  { code: 0x2067, name: 'RIGHT-TO-LEFT ISOLATE' },
  { code: 0x2068, name: 'FIRST STRONG ISOLATE' },
  { code: 0x2069, name: 'POP DIRECTIONAL ISOLATE' },
];

const INVISIBLE_SET = new Set(INVISIBLE_CHARS.map((c) => c.code));
const NAME_BY_CODE = new Map(INVISIBLE_CHARS.map((c) => [c.code, c.name]));

function isControlChar(code: number): boolean {
  return (code >= 0 && code <= 8) || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127;
}

let seq = 0;

/**
 * Detecta caracteres invisíveis, de controle e separadores Unicode incomuns.
 */
export function analyzeUnicode(textPage: PageTextContent): Finding[] {
  const findings: Finding[] = [];

  for (const item of textPage.items) {
    const hits: Array<{ char: string; code: number; name: string; index: number }> = [];

    for (let i = 0; i < item.str.length; i++) {
      const code = item.str.charCodeAt(i);
      if (INVISIBLE_SET.has(code)) {
        hits.push({
          char: item.str[i],
          code,
          name: NAME_BY_CODE.get(code) ?? `U+${code.toString(16)}`,
          index: i,
        });
      } else if (isControlChar(code)) {
        hits.push({
          char: item.str[i],
          code,
          name: `CONTROL U+${code.toString(16).toUpperCase()}`,
          index: i,
        });
      }
    }

    if (hits.length === 0) continue;

    // Evitar falso positivo em strings só com espaços normais
    const visible = item.str.replace(/[\s\u00a0]/g, '');
    const onlyInvisible = visible.length === 0 || hits.length >= Math.max(1, item.str.length * 0.3);

    seq += 1;
    findings.push({
      id: `unicode-${seq}`,
      page: item.page,
      text: item.str.slice(0, 200),
      category: 'invisible_unicode',
      reason: `Caracteres Unicode invisíveis ou de controle detectados (${hits
        .slice(0, 5)
        .map((h) => h.name)
        .join(', ')}${hits.length > 5 ? '…' : ''}).`,
      bbox: item.bbox,
      visibility: 'invisible',
      confidence: onlyInvisible ? 'high' : 'medium',
      severity: onlyInvisible ? 'medium' : 'low',
      evidence: {
        count: hits.length,
        samples: hits.slice(0, 10).map((h) => ({
          code: `U+${h.code.toString(16).toUpperCase()}`,
          name: h.name,
          index: h.index,
        })),
      },
    });
  }

  return findings;
}
