/// <reference lib="webworker" />
import { analyzePdf } from '../analysis/pipeline';
import type { AnalysisProgress, AnalysisReport } from '../types/findings';

export type WorkerRequest =
  | {
      type: 'analyze';
      id: string;
      fileName: string;
      fileSize: number;
      data: ArrayBuffer;
      password?: string;
    }
  | { type: 'cancel'; id: string };

export type WorkerResponse =
  | { type: 'progress'; id: string; progress: AnalysisProgress }
  | { type: 'result'; id: string; report: AnalysisReport }
  | { type: 'error'; id: string; message: string; code?: string };

let currentId: string | null = null;

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  if (msg.type === 'cancel') {
    if (currentId === msg.id) currentId = null;
    return;
  }

  if (msg.type !== 'analyze') return;

  currentId = msg.id;
  const id = msg.id;

  try {
    const report = await analyzePdf({
      fileName: msg.fileName,
      fileSize: msg.fileSize,
      data: msg.data,
      password: msg.password,
      onProgress: (progress) => {
        if (currentId !== id) return;
        const response: WorkerResponse = { type: 'progress', id, progress };
        self.postMessage(response);
      },
    });

    if (currentId !== id) return;
    const response: WorkerResponse = { type: 'result', id, report };
    self.postMessage(response);
  } catch (error) {
    if (currentId !== id) return;
    const message = error instanceof Error ? error.message : 'Erro desconhecido.';
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code: string }).code)
        : undefined;
    const response: WorkerResponse = { type: 'error', id, message, code };
    self.postMessage(response);
  } finally {
    if (currentId === id) currentId = null;
  }
};

export {};
