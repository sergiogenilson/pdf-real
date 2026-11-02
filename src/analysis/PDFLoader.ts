import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
} from 'pdfjs-dist';

export type LoadErrorCode =
  | 'invalid_pdf'
  | 'password_required'
  | 'incorrect_password'
  | 'unknown';

export class PdfLoadError extends Error {
  readonly code: LoadErrorCode;

  constructor(code: LoadErrorCode, message: string) {
    super(message);
    this.name = 'PdfLoadError';
    this.code = code;
  }
}

let workerConfigured = false;

/** Configura o worker do PDF.js com asset relativo ao bundle (compatível com GitHub Pages). */
export function configurePdfWorker(): void {
  if (workerConfigured) return;
  // Permite que testes Node configurem workerSrc antes (via require.resolve).
  if (!GlobalWorkerOptions.workerSrc) {
    GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString();
  }
  workerConfigured = true;
}

export interface LoadedDocument {
  document: PDFDocumentProxy;
  pageCount: number;
  fingerprint: string;
}

export interface LoadPdfOptions {
  password?: string;
  /** Sobrescreve a URL das fontes padrão (útil em Node/CI). */
  standardFontDataUrl?: string;
}

/**
 * Carrega um PDF a partir de ArrayBuffer/Uint8Array no navegador.
 * Não transmite dados para servidores externos.
 */
export async function loadPdf(
  data: ArrayBuffer | Uint8Array,
  passwordOrOptions?: string | LoadPdfOptions,
): Promise<LoadedDocument> {
  configurePdfWorker();

  const options: LoadPdfOptions =
    typeof passwordOrOptions === 'string'
      ? { password: passwordOrOptions }
      : (passwordOrOptions ?? {});

  // No browser usa public/standard_fonts; em Node/CI o caller deve passar o path do pacote
  // (evitar fetch em "/standard_fonts/", que pode travar o getDocument).
  const standardFontDataUrl =
    options.standardFontDataUrl ??
    (typeof document !== 'undefined'
      ? `${import.meta.env.BASE_URL ?? '/'}standard_fonts/`
      : undefined);

  try {
    const task = getDocument({
      data: data instanceof Uint8Array ? data : new Uint8Array(data),
      password: options.password,
      useSystemFonts: true,
      disableAutoFetch: false,
      disableStream: false,
      ...(standardFontDataUrl ? { standardFontDataUrl } : {}),
    });

    const document = await task.promise;
    return {
      document,
      pageCount: document.numPages,
      fingerprint: document.fingerprints?.[0] ?? 'unknown',
    };
  } catch (error: unknown) {
    const name =
      error && typeof error === 'object' && 'name' in error
        ? String((error as { name: string }).name)
        : '';
    const message =
      error instanceof Error ? error.message : 'Falha ao carregar o PDF.';

    if (name === 'PasswordException' || /password/i.test(message)) {
      const code: LoadErrorCode = /incorrect/i.test(message)
        ? 'incorrect_password'
        : 'password_required';
      throw new PdfLoadError(
        code,
        code === 'incorrect_password'
          ? 'Senha incorreta.'
          : 'Este PDF está protegido por senha.',
      );
    }

    if (name === 'InvalidPDFException' || /invalid pdf/i.test(message)) {
      throw new PdfLoadError('invalid_pdf', 'Arquivo PDF inválido ou corrompido.');
    }

    throw new PdfLoadError('unknown', message);
  }
}

/** Libera recursos do documento carregado. */
export async function destroyPdf(document: PDFDocumentProxy | null): Promise<void> {
  if (!document) return;
  try {
    await document.cleanup();
  } catch {
    // ignora erros de cleanup
  }
  try {
    await document.loadingTask.destroy();
  } catch {
    // ignora erros de destroy
  }
}
