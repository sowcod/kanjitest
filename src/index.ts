import * as fs from 'fs';
import { createCanvas, registerFont } from 'canvas';
import { Tategaki } from './tategaki';

// A4横 (landscape) @ 300dpi
const DPI_SCALE = 300 / 72;
const PAGE_WIDTH = Math.round(841.89 * DPI_SCALE);
const PAGE_HEIGHT = Math.round(595.28 * DPI_SCALE);

// 游教科書体を登録（小学校教科書と同じ字形）
registerFont(
  '/System/Library/AssetsV2/com_apple_MobileAsset_Font8/2b7cea021df336d26a89f699c8469a51c721e9a2.asset/AssetData/Kyokasho.ttc',
  { family: 'YuKyokasho' },
);

function main(): void {
  const canvas = createCanvas(PAGE_WIDTH, PAGE_HEIGHT);
  const ctx = canvas.getContext('2d');

  // 背景を白に塗りつぶす
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);

  // 縦書きライブラリを初期化
  const tategaki = new Tategaki(ctx, {
    font: `${Math.round(13 * DPI_SCALE)}px "YuKyokasho"`,
    lineHeight: 1.0,
    columnGap: 1.9,
  });

  // 通常ルビ・書き取り枠・読み取り枠・送り仮名付き書き取り枠を含む例文
  tategaki.fillTextBlock([
    '「待[ま]て！」と',
    '太[た]郎[ろう]は叫[さけ]んだ。',
    '{明日}[あした]の',
    'よい日[ひ]が来[く]る。',
    '前<今日>[きょう]後',
    '前<漢>[かん]<字>[じ]後',
    '前肉[[にく]]を食[た]べる。',
    '前{学校}[[がっこう]]へ行く。',
    '前{{書く}}[かく]後',
    '前{{慮る}}[おもんぱかる]後',
  ], PAGE_WIDTH - Math.round(60 * DPI_SCALE), Math.round(50 * DPI_SCALE));

  // PNG として書き出す
  const pngBuffer = canvas.toBuffer('image/png');
  fs.writeFileSync('output.png', pngBuffer);
  console.log('output.png を生成しました');
}

main();
