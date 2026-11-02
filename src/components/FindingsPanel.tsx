import type { AnalysisProgress, AnalysisReport, Finding } from '../types/findings';
import { downloadReportJson, downloadReportPdf } from '../analysis';

interface FindingsPanelProps {
  fileName: string;
  fileSize: number;
  analyzing: boolean;
  progress: AnalysisProgress | null;
  report: AnalysisReport | null;
  error: string | null;
  selectedFindingId: string | null;
  onSelectFinding: (finding: Finding) => void;
  onRemove: () => void;
  inspectionMode: boolean;
  onToggleInspection: () => void;
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

const CATEGORY_LABELS: Record<string, string> = {
  low_contrast: 'Baixo contraste',
  transparency: 'Transparência',
  invisible_text_mode: 'Modo invisível (Tr 3)',
  suspicious_size: 'Tamanho suspeito',
  off_page: 'Fora da página',
  occlusion: 'Possível oclusão',
  invisible_unicode: 'Unicode invisível',
  prompt_injection: 'Prompt injection',
  metadata: 'Metadados',
  limitation: 'Limitação',
};

export function FindingsPanel({
  fileName,
  fileSize,
  analyzing,
  progress,
  report,
  error,
  selectedFindingId,
  onSelectFinding,
  onRemove,
  inspectionMode,
  onToggleInspection,
}: FindingsPanelProps) {
  const findings = report?.findings.filter((f) => f.category !== 'limitation') ?? [];
  const limitations = report?.findings.filter((f) => f.category === 'limitation') ?? [];

  const pct =
    progress && progress.totalPages > 0
      ? Math.round((progress.currentPage / progress.totalPages) * 100)
      : analyzing
        ? 8
        : 0;

  return (
    <div className="results-panel">
      <div className="panel-toolbar">
        <div className="meta">
          {fileName} · {formatBytes(fileSize)}
        </div>
        <button
          type="button"
          className={`tool-btn${inspectionMode ? ' active' : ''}`}
          onClick={onToggleInspection}
        >
          {inspectionMode ? 'Inspeção ligada' : 'Modo inspeção'}
        </button>
        <button type="button" className="tool-btn danger" onClick={onRemove}>
          Novo PDF
        </button>
      </div>

      <div className="results-scroll">
        {error && <div className="error-box">{error}</div>}

        {analyzing && (
          <div className="progress-block">
            <strong>{progress?.message ?? 'Processando…'}</strong>
            <div className="progress-bar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
              <span style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}

        {report && (
          <>
            <div className={`risk-banner ${report.overallRisk}`}>
              <h3>Risco geral: {labelSeverity(report.overallRisk)}</h3>
              <p>
                {findings.length === 0
                  ? 'Nenhuma ocorrência técnica registrada. Isso não significa que o documento seja seguro.'
                  : `${findings.length} ocorrência(s) com evidência técnica.`}
              </p>
            </div>

            <div className="stats">
              <div className="stat">
                <strong>{report.pageCount}</strong>
                <span>páginas</span>
              </div>
              <div className="stat">
                <strong>{report.suspiciousElementCount}</strong>
                <span>elementos suspeitos</span>
              </div>
              <div className="stat">
                <strong>{report.promptInjectionCount}</strong>
                <span>prompt injection</span>
              </div>
            </div>

            <p className="disclaimer">{report.disclaimer}</p>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button type="button" className="tool-btn" onClick={() => downloadReportJson(report)}>
                Exportar JSON
              </button>
              <button
                type="button"
                className="tool-btn"
                onClick={() => {
                  void downloadReportPdf(report);
                }}
              >
                Exportar PDF
              </button>
            </div>

            {report.categories.length > 0 && (
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '0.95rem', margin: '0 0 0.5rem' }}>
                  Categorias
                </h3>
                <ul style={{ margin: 0, paddingLeft: '1.1rem', color: 'var(--ink-muted)', fontSize: '0.85rem' }}>
                  {report.categories.map((c) => (
                    <li key={c.category}>
                      {CATEGORY_LABELS[c.category] ?? c.category}: {c.count}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {limitations.map((f) => (
              <div key={f.id} className="risk-banner info">
                <h3>Limitação</h3>
                <p>{f.reason}</p>
              </div>
            ))}

            {findings.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`finding${selectedFindingId === f.id ? ' selected' : ''}`}
                onClick={() => onSelectFinding(f)}
              >
                <div className="finding-top">
                  <span className={`sev ${f.severity}`}>{labelSeverity(f.severity)}</span>
                  <span>
                    p.{f.page || '—'} · {CATEGORY_LABELS[f.category] ?? f.category}
                  </span>
                </div>
                <p className="finding-reason">{f.reason}</p>
                {f.text && <p className="finding-text">{f.text}</p>}
                <p className="disclaimer" style={{ marginTop: '0.4rem' }}>
                  Visibilidade: {f.visibility} · Confiança: {f.confidence}
                  {f.bbox
                    ? ` · bbox (${f.bbox.x.toFixed(0)}, ${f.bbox.y.toFixed(0)})`
                    : ''}
                </p>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function labelSeverity(s: string): string {
  const map: Record<string, string> = {
    info: 'Informativo',
    low: 'Baixo',
    medium: 'Médio',
    high: 'Alto',
    critical: 'Crítico',
  };
  return map[s] ?? s;
}
