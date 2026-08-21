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
 * 問題番号を丸数字の文字列にする。
 * 1〜20は①〜⑳、21〜35は㉑〜㉟、36〜50は㊱〜㊿を使い、それ以上は "n." にフォールバックする
 * （通常運用の10問程度では発生しないが、安全のため）。
 */
function circledNumber(n: number): string {
  if (n >= 1 && n <= 20) return String.fromCodePoint(0x2460 + (n - 1));
  if (n >= 21 && n <= 35) return String.fromCodePoint(0x3251 + (n - 21));
  if (n >= 36 && n <= 50) return String.fromCodePoint(0x32b1 + (n - 36));
  return `${n}.`;
}

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
  const numberFontSize = Math.round(fontSize * 0.55);
  const numberGap = Math.round(4 * scale);

  // 列は右端(i=0)から左へ、列内は上から下へ描画される。これは縦書きの自然な読み順
  // （右→左、上→下）と一致するため、この描画順のまま①②③…と採番する。
  let qNumber = 1;

  for (let i = 0; i < columns.length && i < NUM_COLUMNS; i++) {
    const cx = pageWidthPx - marginH - i * columnStep;
    let currentY = marginV;
    const group = columns[i];

    for (let j = 0; j < group.length; j++) {
      const q = group[j];

      ctx.save();
      ctx.font = `${numberFontSize}px sans-serif`;
      ctx.fillStyle = '#555555';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(circledNumber(qNumber), cx, currentY - numberGap);
      ctx.restore();
      qNumber++;

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
