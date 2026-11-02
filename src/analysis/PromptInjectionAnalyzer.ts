import type { Confidence, Finding, Severity, Visibility } from '../types/findings';
import type { PageTextContent } from './TextExtractor';

export interface InjectionMatch {
  severity: Severity;
  confidence: Confidence;
  matchedPatterns: string[];
  reason: string;
}

interface PatternRule {
  id: string;
  /** Padrões EN/PT — não disparam sozinhos como ataque sem contexto. */
  patterns: RegExp[];
  baseSeverity: Severity;
  description: string;
}

const RULES: PatternRule[] = [
  {
    id: 'ignore_previous',
    patterns: [
      /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)/i,
      /disregard\s+(all\s+)?(previous|prior|above)/i,
      /ignore\s+todas?\s+as?\s+instru[cç][oõ]es?\s+anteriores/i,
      /desconsidere?\s+(todas?\s+)?(as?\s+)?instru[cç][oõ]es?\s+anteriores/i,
      /esque[cç]a\s+(todas?\s+)?(as?\s+)?instru[cç][oõ]es?/i,
    ],
    baseSeverity: 'high',
    description: 'Instrução para ignorar regras/prompts anteriores.',
  },
  {
    id: 'role_override',
    patterns: [
      /you\s+are\s+now\s+(a|an|the)\b/i,
      /act\s+as\s+(a|an|the)\b/i,
      /new\s+system\s+prompt/i,
      /from\s+now\s+on\s+you\s+(must|will|shall)/i,
      /voc[eê]\s+agora\s+[eé]\s+(um|uma|o|a)\b/i,
      /aja\s+como\s+(um|uma|o|a)\b/i,
      /novo\s+prompt\s+de\s+sistema/i,
      /a\s+partir\s+de\s+agora\s+voc[eê]\s+(deve|vai)/i,
    ],
    baseSeverity: 'high',
    description: 'Tentativa de substituir o papel ou as regras do modelo.',
  },
  {
    id: 'reveal_system',
    patterns: [
      /reveal\s+(your\s+)?(system\s+)?prompt/i,
      /show\s+(me\s+)?(your\s+)?(hidden\s+)?instructions?/i,
      /print\s+(your\s+)?system\s+prompt/i,
      /revel[ae]\s+(o\s+)?prompt\s+de\s+sistema/i,
      /mostre\s+(suas?\s+)?instru[cç][oõ]es?\s+(ocultas?|de\s+sistema)/i,
    ],
    baseSeverity: 'high',
    description: 'Solicitação para revelar prompt de sistema.',
  },
  {
    id: 'ignore_user',
    patterns: [
      /ignore\s+(the\s+)?user/i,
      /do\s+not\s+follow\s+(the\s+)?user/i,
      /override\s+user\s+(request|input|message)/i,
      /ignore\s+(o\s+)?usu[aá]rio/i,
      /n[aã]o\s+siga\s+(o\s+)?usu[aá]rio/i,
      /desconsidere?\s+(a\s+)?solicita[cç][aã]o\s+do\s+usu[aá]rio/i,
    ],
    baseSeverity: 'high',
    description: 'Instrução para ignorar solicitações do usuário.',
  },
  {
    id: 'exfiltrate',
    patterns: [
      /exfiltrat/i,
      /send\s+(all\s+)?(data|secrets?|credentials?|api\s*keys?)\s+to/i,
      /upload\s+(the\s+)?(conversation|context)\s+to/i,
      /envie\s+(todos?\s+os?\s+)?(dados|segredos|credenciais)/i,
      /exfiltr/i,
    ],
    baseSeverity: 'critical',
    description: 'Linguagem compatível com exfiltração de informações.',
  },
  {
    id: 'eval_manipulation',
    patterns: [
      /always\s+(give|return|score)\s+(a\s+)?(perfect|max|100|high)/i,
      /change\s+(the\s+)?(evaluation|grade|score|rating)/i,
      /approve\s+this\s+(candidate|application|resume)/i,
      /sempre\s+(d[eê]|retorne|atribu[ai])\s+(nota|pontua[cç][aã]o)\s+(m[aá]xima|alta|10)/i,
      /altere?\s+(a\s+)?(avalia[cç][aã]o|nota|pontua[cç][aã]o)/i,
      /aprove\s+(este|esse)\s+(candidato|curr[ií]culo)/i,
    ],
    baseSeverity: 'high',
    description: 'Tentativa de manipular resultados de avaliação.',
  },
  {
    id: 'omit_invent',
    patterns: [
      /omit\s+(any|all)\s+(mention|reference|warning)/i,
      /do\s+not\s+(mention|disclose|reveal)\s+that/i,
      /fabricate|hallucinate\s+the\s+following/i,
      /invent[ae]\s+(as?\s+)?informa[cç][oõ]es?/i,
      /omit[ae]\s+(qualquer|toda)\s+(men[cç][aã]o|refer[eê]ncia)/i,
      /n[aã]o\s+mencione\s+que/i,
    ],
    baseSeverity: 'medium',
    description: 'Instrução para omitir ou inventar informações.',
  },
  {
    id: 'unsolicited_actions',
    patterns: [
      /without\s+(being\s+)?asked/i,
      /even\s+if\s+the\s+user\s+(says|asks|requests)\s+otherwise/i,
      /mesmo\s+que\s+o\s+usu[aá]rio\s+(diga|pe[cç]a)\s+o\s+contr[aá]rio/i,
      /sem\s+que\s+(lhe\s+)?pe[cç]am/i,
    ],
    baseSeverity: 'medium',
    description: 'Instrução para executar ações não solicitadas.',
  },
  {
    id: 'llm_marker',
    patterns: [
      /<\s*\/?\s*system\s*>/i,
      /\[\s*INST\s*\]/i,
      /<<\s*SYS\s*>>/i,
      /begin\s+system\s+instructions?/i,
      /in[ií]cio\s+das?\s+instru[cç][oõ]es?\s+de\s+sistema/i,
    ],
    baseSeverity: 'high',
    description: 'Marcadores típicos de delimitação de prompt de sistema.',
  },
];

function bumpSeverity(s: Severity, steps: number): Severity {
  const order: Severity[] = ['info', 'low', 'medium', 'high', 'critical'];
  const idx = Math.min(order.length - 1, order.indexOf(s) + steps);
  return order[idx];
}

/**
 * Avalia um trecho de texto quanto a prompt injection.
 * Não classifica automaticamente qualquer ocorrência como ataque:
 * o contexto (oculto / metadado) eleva severidade e confiança.
 */
export function scorePromptInjection(
  text: string,
  context: { isHidden: boolean; source: 'body' | 'metadata' },
): InjectionMatch | null {
  const trimmed = text.trim();
  if (trimmed.length < 8) return null;

  const matched: string[] = [];
  let bestSeverity: Severity = 'info';
  let descriptions: string[] = [];

  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(trimmed)) {
        matched.push(rule.id);
        descriptions.push(rule.description);
        const order: Severity[] = ['info', 'low', 'medium', 'high', 'critical'];
        if (order.indexOf(rule.baseSeverity) > order.indexOf(bestSeverity)) {
          bestSeverity = rule.baseSeverity;
        }
        break;
      }
    }
  }

  if (matched.length === 0) return null;

  // Frases isoladas e visíveis sem outros indícios → confiança menor
  let confidence: Confidence = matched.length >= 2 ? 'high' : 'medium';
  let severity = bestSeverity;

  if (context.isHidden) {
    severity = bumpSeverity(severity, 1);
    confidence = confidence === 'medium' ? 'high' : confidence;
  } else if (context.source === 'body' && matched.length === 1) {
    // Visível + um único padrão: pode ser discussão legítima sobre segurança
    severity = severity === 'critical' ? 'high' : bumpSeverity(severity, -1);
    if (severity === 'info') severity = 'low';
    confidence = 'low';
  }

  if (context.source === 'metadata') {
    severity = bumpSeverity(severity, 1);
  }

  return {
    severity,
    confidence,
    matchedPatterns: [...new Set(matched)],
    reason: descriptions[0] ?? 'Linguagem compatível com prompt injection.',
  };
}

let seq = 0;

export function analyzePromptInjection(
  textPage: PageTextContent,
  hiddenItemIds: Set<string>,
): Finding[] {
  const findings: Finding[] = [];

  for (const item of textPage.items) {
    const isHidden = hiddenItemIds.has(item.id);
    const match = scorePromptInjection(item.str, {
      isHidden,
      source: 'body',
    });
    if (!match) continue;

    seq += 1;
    const visibility: Visibility = isHidden ? 'invisible' : 'visible';
    findings.push({
      id: `inject-${seq}`,
      page: item.page,
      text: item.str.slice(0, 500),
      category: 'prompt_injection',
      reason:
        match.reason +
        (isHidden
          ? ' Conteúdo também marcado como visualmente oculto/suspeito.'
          : ' Conteúdo aparentemente visível — revisar contexto antes de tratar como ataque.'),
      bbox: item.bbox,
      visibility,
      confidence: match.confidence,
      severity: match.severity,
      evidence: {
        matchedPatterns: match.matchedPatterns,
        isHidden,
      },
    });
  }

  return findings;
}
