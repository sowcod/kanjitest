import { PDFDocument } from 'pdf-lib';
import { Question } from './questionStore.js';
import { renderPageToCanvas, A4_WIDTH_PT, A4_HEIGHT_PT } from './canvasRenderer.js';

export { renderPageToCanvas, A4_WIDTH_PT, A4_HEIGHT_PT };

/**
 * A4ページをCanvasに描画してPNG化し、pdf-libで画像として埋め込んでPDFを生成する。
 *
 * 縦書き描画（Tategaki）はCanvas 2D APIに依存しているため、pdf-lib自体のテキスト描画APIで
 * 縦書きを再実装するコストを避け、画像埋め込みAPIとして活用する（kanji-app-plan.md参照）。
 * トレードオフ: PDF内のテキストは選択・検索不可（印刷用途のみなら問題ない）。
 */

/** CanvasをPNGにエンコードし、pdf-libに埋め込める ArrayBuffer として返す */
async function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<ArrayBuffer> {
  const dataUrl = canvas.toDataURL('image/png');
  const response = await fetch(dataUrl);
  return response.arrayBuffer();
}

/**
 * ページ右下に生成日時ラベルを小さく印字する（横書き）。
 * 紙の解答は印刷しない運用のため、あとで画面上の履歴（同じラベル表示）と
 * 対応付けるための識別子として使う（vision.md「5. テスト履歴の閲覧機能」）。
 */
function stampLabel(canvas: HTMLCanvasElement, label: string): void {
  const ctx = canvas.getContext('2d')!;
  const scale = canvas.width / A4_WIDTH_PT;
  const fontSize = Math.round(11 * scale);
  const margin = Math.round(16 * scale);
  ctx.save();
  ctx.font = `${fontSize}px sans-serif`;
  ctx.fillStyle = '#888888';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(label, canvas.width - margin, canvas.height - margin);
  ctx.restore();
}

/**
 * A4・1ページ（テスト用・空欄）のPDFを生成する。
 *
 * 紙の節約のため解答ページは印刷しない（答え合わせは画面上の履歴機能で行う）。
 * `label` はページ右下に印字する生成日時ラベル（`testHistoryStore.formatTestLabel`）で、
 * 印刷した用紙とあとで画面表示する解答を対応付けるための手がかりにする。
 */
export async function generateTestPdf(columns: Question[][], font: string, label: string): Promise<Uint8Array> {
  const testCanvas = renderPageToCanvas(columns, false, font);
  stampLabel(testCanvas, label);

  const pdfDoc = await PDFDocument.create();
  const pngBytes = await canvasToPngBytes(testCanvas);
  const image = await pdfDoc.embedPng(pngBytes);
  const page = pdfDoc.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);
  page.drawImage(image, { x: 0, y: 0, width: A4_WIDTH_PT, height: A4_HEIGHT_PT });
  return pdfDoc.save();
}

/** 生成したPDFを新しいタブで開く（ブラウザ標準のPDFビューアの印刷ボタンで印刷する） */
export function openPdfInNewTab(bytes: Uint8Array): void {
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
}
