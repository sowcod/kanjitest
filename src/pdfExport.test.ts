import { PDFDocument } from 'pdf-lib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { A4_HEIGHT_PT, A4_WIDTH_PT, generateTestPdf } from './pdfExport';
import type { Question } from './questionStore';
import { installFakeCanvasContext } from './test/fakeCanvasContext';

function mkQuestion(id: string, text: string, weight: 1 | 2 = 1): Question {
  return { id, text, weight, datasetId: 'd', createdAt: id, updatedAt: id };
}

let restore: () => void;
beforeAll(() => {
  restore = installFakeCanvasContext();
});
afterAll(() => {
  restore();
});

describe('generateTestPdf', () => {
  it('produces bytes starting with the PDF magic header', async () => {
    const bytes = await generateTestPdf([[mkQuestion('a', '<今>[きょう]')]], 'sans-serif', 'label');
    const header = String.fromCharCode(...bytes.slice(0, 5));
    expect(header).toBe('%PDF-');
  });

  it('round-trips through pdf-lib as a single A4 page', async () => {
    const bytes = await generateTestPdf([[mkQuestion('a', '<今>[きょう]')]], 'sans-serif', 'label');
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBe(1);
    const { width, height } = loaded.getPage(0).getSize();
    expect(width).toBeCloseTo(A4_WIDTH_PT, 1);
    expect(height).toBeCloseTo(A4_HEIGHT_PT, 1);
  });

  it('does not throw when there are no columns', async () => {
    await expect(generateTestPdf([], 'sans-serif', 'label')).resolves.toBeInstanceOf(Uint8Array);
  });
});
