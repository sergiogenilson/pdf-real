import { useCallback, useEffect, useRef, useState } from 'react';
import { analyzePdf } from '../analysis/pipeline';
import type { AnalysisProgress, AnalysisReport } from '../types/findings';
import type { WorkerRequest, WorkerResponse } from '../workers/analysis.worker';

export interface DocumentSession {
  file: File;
  data: ArrayBuffer;
  objectUrl: string;
}

interface AnalysisState {
  session: DocumentSession | null;
  progress: AnalysisProgress | null;
  report: AnalysisReport | null;
  error: string | null;
  analyzing: boolean;
}

let requestSeq = 0;

export function usePdfAnalysis() {
  const [state, setState] = useState<AnalysisState>({
    session: null,
    progress: null,
    report: null,
    error: null,
    analyzing: false,
  });

  const workerRef = useRef<Worker | null>(null);
  const activeIdRef = useRef<string | null>(null);

  useEffect(() => {
    try {
      const worker = new Worker(
        new URL('../workers/analysis.worker.ts', import.meta.url),
        { type: 'module' },
      );
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const msg = event.data;
        if (msg.id !== activeIdRef.current) return;

        if (msg.type === 'progress') {
          setState((s) => ({ ...s, progress: msg.progress }));
        } else if (msg.type === 'result') {
          setState((s) => ({
            ...s,
            analyzing: false,
            report: msg.report,
            progress: {
              phase: 'done',
              currentPage: msg.report.pageCount,
              totalPages: msg.report.pageCount,
              message: 'Análise concluída.',
            },
          }));
          activeIdRef.current = null;
        } else if (msg.type === 'error') {
          setState((s) => ({
            ...s,
            analyzing: false,
            error: msg.message,
            progress: {
              phase: 'error',
              currentPage: 0,
              totalPages: 0,
              message: msg.message,
            },
          }));
          activeIdRef.current = null;
        }
      };
      workerRef.current = worker;
    } catch {
      workerRef.current = null;
    }

    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const clearSession = useCallback(() => {
    if (activeIdRef.current && workerRef.current) {
      const cancel: WorkerRequest = { type: 'cancel', id: activeIdRef.current };
      workerRef.current.postMessage(cancel);
      activeIdRef.current = null;
    }
    setState((s) => {
      if (s.session?.objectUrl) URL.revokeObjectURL(s.session.objectUrl);
      return {
        session: null,
        progress: null,
        report: null,
        error: null,
        analyzing: false,
      };
    });
  }, []);

  const startAnalysis = useCallback(
    async (file: File) => {
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        setState((s) => ({
          ...s,
          error: 'Aceitamos apenas arquivos PDF.',
        }));
        return;
      }

      clearSession();

      const data = await file.arrayBuffer();
      const objectUrl = URL.createObjectURL(file);
      const session: DocumentSession = { file, data, objectUrl };

      requestSeq += 1;
      const id = `req-${requestSeq}`;
      activeIdRef.current = id;

      setState({
        session,
        progress: {
          phase: 'loading',
          currentPage: 0,
          totalPages: 0,
          message: 'Iniciando análise local…',
        },
        report: null,
        error: null,
        analyzing: true,
      });

      const worker = workerRef.current;
      if (worker) {
        // Transferência do buffer — clonar para o viewer manter uma cópia
        const copy = data.slice(0);
        const request: WorkerRequest = {
          type: 'analyze',
          id,
          fileName: file.name,
          fileSize: file.size,
          data: copy,
        };
        worker.postMessage(request, [copy]);
        return;
      }

      // Fallback na thread principal
      try {
        const report = await analyzePdf({
          fileName: file.name,
          fileSize: file.size,
          data,
          onProgress: (progress) => {
            setState((s) => ({ ...s, progress }));
          },
        });
        setState((s) => ({
          ...s,
          analyzing: false,
          report,
          progress: {
            phase: 'done',
            currentPage: report.pageCount,
            totalPages: report.pageCount,
            message: 'Análise concluída.',
          },
        }));
      } catch (error) {
        setState((s) => ({
          ...s,
          analyzing: false,
          error: error instanceof Error ? error.message : 'Erro na análise.',
        }));
      }
    },
    [clearSession],
  );

  return {
    ...state,
    startAnalysis,
    clearSession,
  };
}
