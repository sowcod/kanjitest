import * as fs from 'fs';
import { createCanvas, registerFont } from 'canvas';
import { PDFDocument } from 'pdf-lib';
import { Tategaki } from './tategaki';

// A4横 (landscape) のPDFポイントサイズ
const PAGE_WIDTH = 841.89;
const PAGE_HEIGHT = 595.28;

// 印刷品質: 300DPI / 72DPI = 約4.167倍
const DPI_SCALE = 300 / 72;

// 游教科書体を登録（小学校教科書と同じ字形）
registerFont(
  '/System/Library/AssetsV2/com_apple_MobileAsset_Font8/2b7cea021df336d26a89f699c8469a51c721e9a2.asset/AssetData/Kyokasho.ttc',
  { family: 'YuKyokasho' },
);

async function main(): Promise<void> {
  // 1. 高解像度Canvasにテキストを描画
  const canvas = createCanvas(PAGE_WIDTH * DPI_SCALE, PAGE_HEIGHT * DPI_SCALE);
  const ctx = canvas.getContext('2d');

  // スケールをかけてPDFポイント座標系のまま描画できるようにする
  ctx.scale(DPI_SCALE, DPI_SCALE);

  // 背景を白に塗りつぶす
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);

  // 縦書きライブラリを初期化
  const tategaki = new Tategaki(ctx, {
    font: '26px "YuKyokasho"',
    lineHeight: 1.0,
    columnGap: 1.9,
  });

  // 括弧・句読点・小文字・ふりがな（1文字・グループ両方）を含む例文
  tategaki.fillTextBlock([
    '「待[ま]て！」と',
    '太[た]郎[ろう]は叫[さけ]んだ。',
    '{明日}[あした]の',
    '{今日}[きょう]より',
    'よい日[ひ]が来[く]る。',
    '（きっと、',
    'ゆっくりっと…）',
    '「あっ、ちょっと！」',
  ], PAGE_WIDTH - 60, 50);

  // 2. CanvasをPNG画像として取得
  const pngBuffer = canvas.toBuffer('image/png');

  // 3. pdf-libでPDFを生成しPNG画像を埋め込む
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  const pngImage = await pdfDoc.embedPng(pngBuffer);
  page.drawImage(pngImage, {
    x: 0,
    y: 0,
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
  });

  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync('output.pdf', pdfBytes);
  console.log('output.pdf を生成しました');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
