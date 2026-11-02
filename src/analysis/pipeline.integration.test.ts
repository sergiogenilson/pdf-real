import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { GlobalWorkerOptions } from 'pdfjs-dist';
import { beforeAll, describe, expect, it } from 'vitest';
import { analyzePdf } from './pipeline';

const require = createRequire(import.meta.url);
const fixturesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../fixtures',
);

beforeAll(() => {
  GlobalWorkerOptions.workerSrc = pathToFileURL(
    require.resolve('pdfjs-dist/build/pdf.worker.min.mjs'),
  ).href;
});

async function analyzeFixture(name: string) {
  const filePath = path.join(fixturesDir, name);
  const data = fs.readFileSync(filePath);
  return analyzePdf({
    fileName: name,
    fileSize: data.byteLength,
    data: new Uint8Array(data),
  });
}

describe('analyzePdf fixtures', () => {
  it('detecta baixo contraste em white-on-white.pdf', async () => {
    const report = await analyzeFixture('white-on-white.pdf');
    expect(report.pageCount).toBe(1);
    expect(
      report.findings.some(
        (f) => f.category === 'low_contrast' || f.category === 'prompt_injection',
      ),
    ).toBe(true);
  }, 60_000);

  it('detecta Tr 3 em tr3-invisible.pdf', async () => {
    const report = await analyzeFixture('tr3-invisible.pdf');
    expect(
      report.findings.some((f) => f.category === 'invisible_text_mode'),
    ).toBe(true);
  }, 60_000);

  it('não inventa achados críticos em clean.pdf', async () => {
    const report = await analyzeFixture('clean.pdf');
    expect(report.findings.some((f) => f.severity === 'critical')).toBe(false);
    expect(report.disclaimer.length).toBeGreaterThan(10);
  }, 60_000);

  it('detecta injection em metadados', async () => {
    const report = await analyzeFixture('metadata-injection.pdf');
    expect(report.findings.some((f) => f.category === 'metadata')).toBe(true);
  }, 60_000);

  it('analisa feira-da-fruta.pdf com ocultações e injections', async () => {
    const report = await analyzeFixture('feira-da-fruta.pdf');
    expect(report.pageCount).toBe(2);
    expect(report.promptInjectionCount).toBeGreaterThan(0);
    expect(
      report.findings.some(
        (f) =>
          f.category === 'low_contrast' ||
          f.category === 'invisible_text_mode' ||
          f.category === 'off_page' ||
          f.category === 'suspicious_size',
      ),
    ).toBe(true);
    const joined = report.findings.map((f) => f.text).join(' ');
    expect(/banana|laranja|goiaba|mamao|manga|abacaxi/i.test(joined)).toBe(true);
  }, 60_000);
});
