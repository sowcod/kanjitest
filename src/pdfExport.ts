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
const NUM_COLUMNS = 8;

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

  // 印刷時、上下左右いずれも1cm相当の余白を確保する。
  const CM_TO_PT = 72 / 2.54;
  const margin = Math.round(CM_TO_PT * scale);
  const fontSize = Math.round(17 * scale);
  const rowGap = fontSize * 1.5;
  // これを超える問題は用紙の物理的な余白・印刷不可領域にはみ出してしまうため描画しない。
  const maxY = pageHeightPx - margin;

  const tategaki = new Tategaki(ctx, {
    font: `${fontSize}px "${font}"`,
    lineHeight: 1.0,
    showAnswer,
  });

  const numberFontSize = Math.round(fontSize * 0.55);
  const numberGap = Math.round(4 * scale);

  // 丸数字は本文の上に(textBaseline: bottom で)重ねて描くため、その実際の高さ(ascent)
  // ぶん本文の開始Yを下げないと、数字が上端の余白に食い込んでしまう。
  ctx.save();
  ctx.font = `${numberFontSize}px sans-serif`;
  const numberAscent = ctx.measureText('①').actualBoundingBoxAscent;
  ctx.restore();
  const startY = margin + numberGap + numberAscent;

  // 列内容の実際のインク幅（ルビ・書き取り枠などを含む）を踏まえて、右端の列の中心Xを決める。
  // これにより内容によらず右端は margin ぴったりの余白に収まる。
  const usedColumns = Math.min(columns.length, NUM_COLUMNS);
  const maxBodyOffset = (group: Question[], side: 'bodyLeft' | 'bodyRight'): number =>
    group.reduce((m, q) => Math.max(m, tategaki.measureText(q.text)[side]), 0);
  const cxRight = pageWidthPx - margin - maxBodyOffset(columns[0] ?? [], 'bodyRight');
  // 列の間隔(ピッチ)は実際に使う列数に関わらず、常にNUM_COLUMNS列分割の間隔で固定する。
  // これにより問題数が少ないときも均等割りで間延びさせず、いつもと同じ間隔で右詰めに配置する。
  const leftBodyOffset = columns
    .slice(0, usedColumns)
    .reduce((m, group) => Math.max(m, maxBodyOffset(group, 'bodyLeft')), 0);
  const cxLeft = margin + leftBodyOffset;
  const columnStep = (cxRight - cxLeft) / (NUM_COLUMNS - 1);

  // 列は右端(i=0)から左へ、列内は上から下へ描画される。これは縦書きの自然な読み順
  // （右→左、上→下）と一致するため、この描画順のまま①②③…と採番する。
  let qNumber = 1;

  for (let i = 0; i < usedColumns; i++) {
    const cx = cxRight - i * columnStep;
    let currentY = startY;
    const group = columns[i];

    for (let j = 0; j < group.length; j++) {
      const q = group[j];
      const { height } = tategaki.measureText(q.text);
      if (currentY + height > maxY) break;

      ctx.save();
      ctx.font = `${numberFontSize}px sans-serif`;
      ctx.fillStyle = '#555555';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(circledNumber(qNumber), cx, currentY - numberGap);
      ctx.restore();
      qNumber++;

      tategaki.fillText(q.text, cx, currentY);
      currentY += height;

      if (j < group.length - 1) {
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
