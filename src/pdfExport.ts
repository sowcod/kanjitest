import { PDFDocument } from 'pdf-lib';
import { Tategaki } from './tategaki.js';
import { Question } from './questionStore.js';

/**
 * A4ページをCanvasに描画してPNG化し、pdf-libで画像として埋め込んでPDFを生成する。
 *
 * 縦書き描画（Tategaki）はCanvas 2D APIに依存しているため、pdf-lib自体のテキスト描画APIで
 * 縦書きを再実装するコストを避け、画像埋め込みAPIとして活用する（kanji-app-plan.md参照）。
 * トレードオフ: PDF内のテキストは選択・検索不可（印刷用途のみなら問題ない）。
 */

const DPI_SCALE = 300 / 72; // 300dpi相当（src/index.ts のA4出力と合わせる）
export const A4_WIDTH_PT = 595.28;
export const A4_HEIGHT_PT = 841.89;
const PAGE_WIDTH_PX = Math.round(A4_WIDTH_PT * DPI_SCALE);
const PAGE_HEIGHT_PX = Math.round(A4_HEIGHT_PT * DPI_SCALE);
const NUM_COLUMNS = 5;

/**
 * A4比率のCanvasに5列レイアウトを描画する。
 * `pageWidthPx`/`pageHeightPx` を変えることで、画面プレビュー（低解像度）と
 * PDF出力（300dpi相当）の両方で同じレイアウトロジックを共有できる。
 */
export function renderPageToCanvas(
  columns: Question[][],
  showAnswer: boolean,
  font: string,
  pageWidthPx: number = PAGE_WIDTH_PX,
  pageHeightPx: number = PAGE_HEIGHT_PX,
): HTMLCanvasElement {
  const scale = pageWidthPx / A4_WIDTH_PT;
  const canvas = document.createElement('canvas');
  canvas.width = pageWidthPx;
  canvas.height = pageHeightPx;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const marginH = Math.round(50 * scale);
  const marginV = Math.round(60 * scale);
  const fontSize = Math.round(17 * scale);
  const rowGap = fontSize * 1.5;

  const tategaki = new Tategaki(ctx, {
    font: `${fontSize}px "${font}"`,
    lineHeight: 1.0,
    showAnswer,
  });

  const usableWidth = pageWidthPx - marginH * 2;
  const columnStep = usableWidth / (NUM_COLUMNS - 1);

  for (let i = 0; i < columns.length && i < NUM_COLUMNS; i++) {
    const cx = pageWidthPx - marginH - i * columnStep;
    let currentY = marginV;
    const group = columns[i];

    for (let j = 0; j < group.length; j++) {
      const q = group[j];
      tategaki.fillText(q.text, cx, currentY);
      const { height } = tategaki.measureText(q.text);
      currentY += height;

      if (j < group.length - 1) {
        const lineY = currentY + rowGap / 2;
        ctx.save();
        ctx.strokeStyle = '#bbbbbb';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - fontSize * 1.5, lineY);
        ctx.lineTo(cx + fontSize * 1.5, lineY);
        ctx.stroke();
        ctx.restore();
        currentY += rowGap;
      }
    }
  }

  return canvas;
}

/** CanvasをPNGにエンコードし、pdf-libに埋め込める ArrayBuffer として返す */
async function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<ArrayBuffer> {
  const dataUrl = canvas.toDataURL('image/png');
  const response = await fetch(dataUrl);
  return response.arrayBuffer();
}

/**
 * A4・2ページ（1ページ目: テスト用（空欄）, 2ページ目: 解答用（朱色）)のPDFを生成する。
 */
export async function generateTestPdf(columns: Question[][], font: string): Promise<Uint8Array> {
  const testCanvas = renderPageToCanvas(columns, false, font);
  const answerCanvas = renderPageToCanvas(columns, true, font);

  const pdfDoc = await PDFDocument.create();
  for (const canvas of [testCanvas, answerCanvas]) {
    const pngBytes = await canvasToPngBytes(canvas);
    const image = await pdfDoc.embedPng(pngBytes);
    const page = pdfDoc.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);
    page.drawImage(image, { x: 0, y: 0, width: A4_WIDTH_PT, height: A4_HEIGHT_PT });
  }
  return pdfDoc.save();
}

/** 生成したPDFを新しいタブで開く（ブラウザ標準のPDFビューアの印刷ボタンで印刷する） */
export function openPdfInNewTab(bytes: Uint8Array): void {
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
}
