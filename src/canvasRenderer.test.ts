import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { A4_HEIGHT_PT, A4_WIDTH_PT, renderPageToCanvas } from './canvasRenderer';
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

describe('renderPageToCanvas', () => {
  it('defaults to A4 at 300dpi in pixels', () => {
    const canvas = renderPageToCanvas([], false, 'sans-serif');
    const dpiScale = 300 / 72;
    expect(canvas.width).toBe(Math.round(A4_WIDTH_PT * dpiScale));
    expect(canvas.height).toBe(Math.round(A4_HEIGHT_PT * dpiScale));
  });

  it('uses the given pageWidthPx/pageHeightPx when provided', () => {
    const canvas = renderPageToCanvas([], false, 'sans-serif', 800, 1200);
    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(1200);
  });

  it('does not throw with no columns', () => {
    expect(() => renderPageToCanvas([], false, 'sans-serif')).not.toThrow();
  });

  it('does not throw rendering a mix of normal/writeBox/readBox/bracketBox questions', () => {
    const columns: Question[][] = [
      [
        mkQuestion('a', '<今>[きょう]は明日です。'),
        mkQuestion('b', '今日[[きょう]]は晴れです。'),
        mkQuestion('c', '{{書く}}[かく]'),
      ],
      [mkQuestion('d', 'ただの文章です。', 2)],
    ];
    expect(() => renderPageToCanvas(columns, false, 'sans-serif')).not.toThrow();
    expect(() => renderPageToCanvas(columns, true, 'sans-serif')).not.toThrow();
  });

  it('does not throw with more than 50 questions in a column (circledNumber fallback)', () => {
    const many = Array.from({ length: 55 }, (_, i) => mkQuestion(`q${i}`, '一'));
    expect(() => renderPageToCanvas([many], false, 'sans-serif')).not.toThrow();
  });

  it('does not throw with more than 8 columns (only the first 8 are used)', () => {
    const columns: Question[][] = Array.from({ length: 12 }, (_, i) => [mkQuestion(`q${i}`, '一')]);
    expect(() => renderPageToCanvas(columns, false, 'sans-serif')).not.toThrow();
  });
});
