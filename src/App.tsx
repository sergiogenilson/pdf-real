import { useState } from 'react';
import { FindingsPanel } from './components/FindingsPanel';
import { PdfViewer } from './components/PdfViewer';
import { ThreatDemo } from './components/ThreatDemo';
import { UploadZone } from './components/UploadZone';
import { usePdfAnalysis } from './hooks/usePdfAnalysis';
import type { Finding } from './types/findings';
import './App.css';

type MobileTab = 'viewer' | 'results';

export default function App() {
  const { session, progress, report, error, analyzing, startAnalysis, clearSession } =
    usePdfAnalysis();
  const [inspectionMode, setInspectionMode] = useState(false);
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [focusPage, setFocusPage] = useState<number | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>('results');

  const onSelectFinding = (finding: Finding) => {
    setSelectedFindingId(finding.id);
    if (finding.page > 0) setFocusPage(finding.page);
    setMobileTab('viewer');
    if (
      finding.visibility === 'invisible' ||
      finding.visibility === 'transparent' ||
      finding.visibility === 'low_contrast' ||
      finding.visibility === 'off_page' ||
      finding.visibility === 'tiny' ||
      finding.visibility === 'occluded'
    ) {
      setInspectionMode(true);
    }
  };

  const onRemove = () => {
    clearSession();
    setSelectedFindingId(null);
    setFocusPage(null);
    setInspectionMode(false);
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-left">
          {session && (
            <button type="button" className="back-btn" onClick={onRemove}>
              ← Voltar
            </button>
          )}
          <button type="button" className="brand" onClick={session ? onRemove : undefined}>
            <span className="brand-name">pdf-real</span>
            <span className="brand-sub">PDF Prompt Injection Scanner</span>
          </button>
        </div>
        <span className="privacy-chip">100% local no navegador</span>
      </header>

      <main className="main">
        {!session ? (
          <div className="landing">
            <section className="hero">
              <h1>
                pdf-real
                <span>PDF Prompt Injection Scanner</span>
              </h1>
              <p>
                Instruções ocultas em PDFs podem manipular modelos de linguagem sem
                que um leitor humano perceba. O pdf-real analisa o documento no seu
                próprio navegador e revela textos de baixo contraste, transparentes,
                fora da página e padrões de prompt injection.
              </p>
            </section>

            <UploadZone disabled={analyzing} onFile={(file) => void startAnalysis(file)} />
            <ThreatDemo />
          </div>
        ) : (
          <>
            <div className="mobile-tabs">
              <button
                type="button"
                className={`tool-btn${mobileTab === 'viewer' ? ' active' : ''}`}
                onClick={() => setMobileTab('viewer')}
              >
                Documento
              </button>
              <button
                type="button"
                className={`tool-btn${mobileTab === 'results' ? ' active' : ''}`}
                onClick={() => setMobileTab('results')}
              >
                Resultados
              </button>
            </div>

            <div
              className={`workspace${
                mobileTab === 'viewer' ? ' hide-results' : ' hide-viewer'
              }`}
            >
              <PdfViewer
                data={session.data}
                findings={report?.findings ?? []}
                selectedFindingId={selectedFindingId}
                inspectionMode={inspectionMode}
                focusPage={focusPage}
              />
              <FindingsPanel
                fileName={session.file.name}
                fileSize={session.file.size}
                analyzing={analyzing}
                progress={progress}
                report={report}
                error={error}
                selectedFindingId={selectedFindingId}
                onSelectFinding={onSelectFinding}
                onRemove={onRemove}
                inspectionMode={inspectionMode}
                onToggleInspection={() => setInspectionMode((v) => !v)}
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
