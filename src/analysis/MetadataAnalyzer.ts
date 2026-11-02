import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { Finding } from '../types/findings';
import { scorePromptInjection } from './PromptInjectionAnalyzer';

let seq = 0;

function asString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  return String(value);
}

/**
 * Inspeciona metadados do documento (info dict / campos disponíveis).
 * Campos com linguagem de prompt injection elevam a severidade.
 */
export async function analyzeMetadata(
  document: PDFDocumentProxy,
): Promise<Finding[]> {
  const findings: Finding[] = [];

  let info: Record<string, unknown> = {};
  try {
    const meta = await document.getMetadata();
    info = (meta?.info ?? {}) as Record<string, unknown>;
  } catch {
    return findings;
  }

  const fields: Array<{ key: string; value: string }> = [];
  for (const [key, raw] of Object.entries(info)) {
    const value = asString(raw).trim();
    if (!value) continue;
    fields.push({ key, value });
  }

  // Campos customizados / Keywords / Subject costumam ser vetores
  for (const field of fields) {
    const injection = scorePromptInjection(field.value, {
      isHidden: true,
      source: 'metadata',
    });

    if (injection) {
      seq += 1;
      findings.push({
        id: `meta-${seq}`,
        page: 0,
        text: field.value.slice(0, 500),
        category: 'metadata',
        reason: `Metadado "${field.key}" contém linguagem compatível com prompt injection.`,
        bbox: null,
        visibility: 'invisible',
        confidence: injection.confidence,
        severity: injection.severity,
        evidence: {
          field: field.key,
          matchedPatterns: injection.matchedPatterns,
          note: 'Metadados não são visíveis na leitura normal do PDF.',
        },
      });
      continue;
    }

    // Campo longo e incomum sem match claro — informativo
    if (
      (field.key === 'Keywords' || field.key === 'Subject' || field.key.startsWith('Custom')) &&
      field.value.length > 80
    ) {
      seq += 1;
      findings.push({
        id: `meta-${seq}`,
        page: 0,
        text: field.value.slice(0, 500),
        category: 'metadata',
        reason: `Campo de metadado "${field.key}" com conteúdo longo; revisado sem padrão claro de injection.`,
        bbox: null,
        visibility: 'invisible',
        confidence: 'low',
        severity: 'info',
        evidence: { field: field.key, length: field.value.length },
      });
    }
  }

  return findings;
}
