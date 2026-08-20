import type { CanvasRenderingContext2D } from 'canvas';
import { parse } from './parser';
import type { Segment } from './parser';

/**
 * 縦書き描画ライブラリ
 *
 * 座標系: Canvas 2D と同じく左上原点。
 * x, y は描画ブロックの「右上」を指定する（縦書きの起点）。
 *
 * 列レイアウト（右→左）:
 *
 *   ←─ 列幅 ──→
 *   [ルビ][本文字]
 *              ↑ x（本文字の右端）
 *
 * 本文字中心 charCx = x - fontSize/2
 * ルビ・括弧は x より右（大きいX値）に描画する。
 * fillTextBlock は列幅ぶん左（小さいX値）に currentX を進める。
 */

// 90度回転が必要な文字（括弧・ダッシュ類）
const ROTATE_CHARS = new Set([
  '（', '）', '(', ')',
  '「', '」', '『', '』',
  '【', '】', '〔', '〕',
  '｛', '｝', '{', '}',
  '〈', '〉', '《', '》',
  '―', '─', '…', '‥',
  '～', '〜',
  '-', '－', '−',
]);

// 右上に寄せる句読点（右寄せ＋上寄せ）
const PUNCTUATION_CHARS = new Set([
  '。', '、', '｡', '､', '・', '･',
]);

// 小文字（右上にシフト）
const SMALL_CHARS = new Set([
  'ぁ', 'ぃ', 'ぅ', 'ぇ', 'ぉ',
  'っ', 'ゃ', 'ゅ', 'ょ', 'ゎ',
  'ァ', 'ィ', 'ゥ', 'ェ', 'ォ',
  'ッ', 'ャ', 'ュ', 'ョ', 'ヮ',
]);

export interface TategakiOptions {
  /** Canvas fontプロパティ文字列（例: '40px "游教科書体"'） */
  font?: string;
  /** 文字間隔（フォントサイズの倍数）。デフォルト: 1.1 */
  lineHeight?: number;
  /** 列間隔（フォントサイズの倍数）。デフォルト: 1.6 */
  columnGap?: number;
  /** 文字色。デフォルト: '#000000' */
  color?: string;
  /** ふりがなサイズ（本文フォントサイズの倍数）。デフォルト: 0.5 */
  rubyRatio?: number;
  /**
   * 書き取り枠の1辺サイズ（px）。
   * デフォルト: fontSize * 2.5
   */
  boxSize?: number;
  /**
   * true のとき枠内の文字・ルビをすべて表示する（解答例印刷用）。
   * デフォルト: false（テスト用・空欄）
   */
  showAnswer?: boolean;
}

export class Tategaki {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly font: string;
  private readonly lineHeight: number;
  private readonly columnGap: number;
  private readonly color: string;
  private readonly rubyRatio: number;
  private readonly _fontSize: number;
  private readonly boxSize: number;
  private readonly showAnswer: boolean;

  constructor(ctx: CanvasRenderingContext2D, options: TategakiOptions = {}) {
    this.ctx = ctx;
    this.font = options.font ?? '40px sans-serif';
    this.lineHeight = options.lineHeight ?? 1.1;
    this.columnGap = options.columnGap ?? 1.6;
    this.color = options.color ?? '#000000';
    this.rubyRatio = options.rubyRatio ?? 0.5;
    this._fontSize = this._parseFontSize(this.font);
    this.boxSize = options.boxSize ?? this._fontSize * 2.5;
    this.showAnswer = options.showAnswer ?? false;
  }

  /** fontプロパティ文字列からフォントサイズ(px)を抽出する */
  private _parseFontSize(font: string): number {
    const m = font.match(/(\d+(?:\.\d+)?)px/);
    return m ? parseFloat(m[1]) : 16;
  }

  /** fontプロパティ文字列のサイズ部分を置換する */
  private _replaceFontSize(font: string, size: number): string {
    return font.replace(/(\d+(?:\.\d+)?)px/, `${size}px`);
  }

  /**
   * 1文字を縦書きで描画する。
   * @param ch       - 1文字
   * @param cx       - 文字セルの中心X
   * @param cy       - 文字セルの中心Y
   * @param fontSize
   */
  private _drawChar(ch: string, cx: number, cy: number, fontSize: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = this._replaceFontSize(this.font, fontSize);
    ctx.fillStyle = this.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (ROTATE_CHARS.has(ch)) {
      ctx.translate(cx, cy);
      ctx.rotate(Math.PI / 2);
      ctx.fillText(ch, 0, 0);
    } else if (PUNCTUATION_CHARS.has(ch)) {
      ctx.textAlign = 'left';
      ctx.fillText(ch, cx + fontSize * 0.5 - fontSize * 0.1, cy - fontSize * 0.7);
    } else if (SMALL_CHARS.has(ch)) {
      ctx.fillText(ch, cx + fontSize * 0.1, cy - fontSize * 0.1);
    } else {
      ctx.fillText(ch, cx, cy);
    }
    ctx.restore();
  }

  /**
   * ルビを描画する（本文字中心X基準）。
   * ルビは charCx + fontSize/2 より右（= x より右）に描画する。
   *
   * @param ruby        - ルビ文字列
   * @param charCx      - 本文字の中心X
   * @param groupTopCy  - グループ先頭文字の中心Y
   * @param groupHeight - グループ全体の縦幅（step × 文字数 など）
   * @param fontSize    - グループ高さ計算の基準サイズ
   * @param rubySize    - ルビのフォントサイズ
   */
  private _drawRuby(
    ruby: string,
    charCx: number,
    groupTopCy: number,
    groupHeight: number,
    fontSize: number,
    rubySize: number,
  ): void {
    const rubyCx = charCx + fontSize / 2 + rubySize / 2 + 2;
    this._drawRubyAt(ruby, rubyCx, groupTopCy, groupHeight, fontSize, rubySize);
  }

  /**
   * ルビをX座標を直接指定して描画する。
   *
   * @param ruby        - ルビ文字列
   * @param rubyCx      - ルビ列の中心X
   * @param groupTopCy  - グループ先頭文字の中心Y
   * @param groupHeight - グループ全体の縦幅
   * @param refSize     - グループ高さ計算の基準サイズ（本文字サイズ or boxSize）
   * @param rubySize    - ルビのフォントサイズ
   */
  private _drawRubyAt(
    ruby: string,
    rubyCx: number,
    groupTopCy: number,
    groupHeight: number,
    refSize: number,
    rubySize: number,
    rubyStep: number = rubySize,
  ): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = this._replaceFontSize(this.font, rubySize);
    ctx.fillStyle = this.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const rubyChars = [...ruby];
    const totalRubyHeight = rubyStep * rubyChars.length;
    const groupCenterY = groupTopCy + (groupHeight - refSize) / 2;
    let ry = groupCenterY - totalRubyHeight / 2 + rubyStep / 2;

    for (const rch of rubyChars) {
      ctx.fillText(rch, rubyCx, ry);
      ry += rubyStep;
    }
    ctx.restore();
  }

  /**
   * 書き取り枠（正方形 + 十字破線補助線）を1つ描画する。
   * @param left  - 枠の左端X
   * @param top   - 枠の上端Y
   * @param size  - 枠の1辺サイズ
   * @param char  - showAnswer時に枠内に描画する文字（省略時は空欄）
   */
  private _drawWriteBox(left: number, top: number, size: number, char?: string): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = this.color;

    // 外枠（実線）
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.strokeRect(left, top, size, size);

    // 十字補助線（破線）
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(left + size / 2, top);
    ctx.lineTo(left + size / 2, top + size);
    ctx.moveTo(left, top + size / 2);
    ctx.lineTo(left + size, top + size / 2);
    ctx.stroke();

    ctx.restore();

    // 解答モード: 枠内に文字を描画
    if (char !== undefined) {
      this._drawChar(char, left + size / 2, top + size / 2, size * 0.7);
    }
  }

  /**
   * 縦長の大括弧を描画する（readBox / bracketBox 共通）。
   * `[` を90度回転して上端に、`]` を90度回転して下端に描画する。
   *
   * @param cx     - 括弧の中心X
   * @param topY   - 括弧の上端Y
   * @param height - 括弧の縦幅
   * @param size   - 括弧グリフのフォントサイズ
   */
  private _drawReadBracket(cx: number, topY: number, height: number, size: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = this._replaceFontSize(this.font, size);
    ctx.fillStyle = this.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 上端: グリフ中心を topY の外側に置き、爪が topY の外側（上）に出る
    ctx.save();
    ctx.translate(cx, topY - size / 2);
    ctx.rotate(Math.PI / 2);
    ctx.fillText('〔', 0, 0);
    ctx.restore();

    // 下端: グリフ中心を topY+height の外側に置き、爪が topY+height の外側（下）に出る
    ctx.save();
    ctx.translate(cx, topY + height + size / 2);
    ctx.rotate(Math.PI / 2);
    ctx.fillText('〕', 0, 0);
    ctx.restore();

    ctx.restore();
  }

  /** bracketBox 用の縦長括弧。爪が topY / topY+height の内側に収まる。 */
  private _drawBracketBox(cx: number, topY: number, height: number, size: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = this._replaceFontSize(this.font, size);
    ctx.fillStyle = this.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 上端: グリフ中心を topY の外側に置き、爪が topY の外側（上）に出る
    ctx.save();
    ctx.translate(cx, topY - size / 2);
    ctx.rotate(Math.PI / 2);
    ctx.fillText('〔', 0, 0);
    ctx.restore();

    // 下端: グリフ中心を topY+height の外側に置き、爪が topY+height の外側（下）に出る
    ctx.save();
    ctx.translate(cx, topY + height + size / 2);
    ctx.rotate(Math.PI / 2);
    ctx.fillText('〕', 0, 0);
    ctx.restore();

    ctx.restore();
  }

  /**
   * Segment 1つ分の列幅を返す。
   *
   * 列幅の設計:
   *   |←─── columnWidth ───→|
   *   |←付属物→|←本体→|
   *             ↑ 本体中心
   *                          ↑ x（列右端）
   *
   * 付属物（ルビ・括弧）は本体の左側に配置し、列の外にははみ出さない。
   * x = 列右端 = 本体右端。
   */
  private _segmentWidth(seg: Segment): number {
    const fontSize = this._fontSize;
    const rubySize = fontSize * this.rubyRatio;
    const bracketWidth = fontSize * 3; // 括弧の列幅（横幅3倍）
    switch (seg.kind) {
      case 'normal':
        return fontSize + (seg.ruby !== null ? rubySize * 1.2 : 0);
      case 'writeBox':
        return this.boxSize + rubySize * 1.2;
      case 'readBox':
        return fontSize + bracketWidth;
      case 'bracketBox':
        return bracketWidth + rubySize * 1.2;
    }
  }

  /**
   * 列幅 = 列内の全 Segment の幅の最大値。
   */
  private _calcColumnWidth(segments: Segment[]): number {
    return segments.reduce((m, s) => Math.max(m, this._segmentWidth(s)), 0);
  }

  /**
   * 1列（1行）を縦書きで描画する。
   * x, y は列の右上を指定（列の右端が x）。
   *
   * 座標設計:
   *   |←─── columnWidth ───→|
   *   |←付属物幅→|←本体幅→|
   *               ↑ 本体中心 = x - columnWidth + 付属物幅 + 本体幅/2
   *                            = x - 本体幅/2 - 右余白
   *                                              ↑ x（列右端）
   *
   * @param text  - テキスト（記法可）
   * @param x     - 列右端のX座標
   * @param y     - 列右上のY座標
   * @returns     実際の列幅（px）
   */
  fillText(text: string, x: number, y: number): number {
    const fontSize = this._fontSize;
    const rubySize = fontSize * this.rubyRatio;
    const step = fontSize * this.lineHeight;
    const boxSize = this.boxSize;
    const bracketWidth = fontSize * 3;     // 括弧の横幅（列幅計算用）
    const bracketGlyphSize = fontSize * 1.5;     // 括弧グリフのフォントサイズ（readBox 用）
    const bracketBoxGlyphSize = fontSize * 3;    // 括弧グリフのフォントサイズ（bracketBox 用）

    const { segments } = parse(text);
    const columnWidth = this._calcColumnWidth(segments);

    // 列幅の設計:
    //   |←─── columnWidth ───→|
    //   |←本体→|←ルビ/括弧→|
    //            ↑ 本体中心 = x - columnWidth + 本体幅/2
    //                                           ↑ x（列右端）
    const boxLeft = x - columnWidth;                  // writeBox の枠左端
    const charCx = x - columnWidth + fontSize / 2;   // readBox の本文字中心
    // normal 文字の中心X: 列内の種類に応じて本体幅の中央に揃える
    const hasWriteBox = segments.some(s => s.kind === 'writeBox');
    const hasBracketBox = segments.some(s => s.kind === 'bracketBox');
    const normalCx = hasWriteBox
      ? boxLeft + boxSize / 2
      : hasBracketBox
        ? boxLeft + bracketWidth / 2
        : charCx;

    // currentY は常に「次のセグメントの上端」
    let currentY = y;

    for (const seg of segments) {
      switch (seg.kind) {

        case 'normal': {
          const cy = currentY + fontSize / 2;
          this._drawChar(seg.char, normalCx, cy, fontSize);
          if (seg.ruby !== null) {
            const groupHeight = step * seg.rubyTotal;
            const rubyCx = normalCx + fontSize / 2 + rubySize * 0.6;
            this._drawRubyAt(seg.ruby, rubyCx, cy, groupHeight, fontSize, rubySize);
          }
          currentY += step;
          break;
        }

        case 'writeBox': {
          // currentY = 枠の上端
          const charToShow = this.showAnswer ? seg.char : undefined;
          this._drawWriteBox(boxLeft, currentY, boxSize, charToShow);

          // ルビはグループ先頭でまとめて描画（枠の右側）
          if (seg.ruby !== null) {
            const groupHeight = boxSize * seg.rubyTotal;
            const boxRight = boxLeft + boxSize;
            const rubyCx = boxRight + rubySize * 0.6;
            // groupTopCy は先頭枠の中心Y。writeBox のルビは字間1.5倍
            this._drawRubyAt(seg.ruby, rubyCx, currentY + boxSize / 2, groupHeight, boxSize, rubySize, rubySize * 1.5);
          }

          currentY += boxSize;
          break;
        }

        case 'readBox': {
          const cy = currentY + fontSize / 2;
          this._drawChar(seg.char, charCx, cy, fontSize);

          // グループ先頭でのみ縦線・括弧を描画（本文字の右側）
          if (seg.rubyIndex === 0) {
            // 漢字の右端に縦線（漢字文字数分の長さ）
            const lineX = charCx + fontSize / 2 + 3;
            const lineBottomY = currentY + step * seg.rubyTotal;
            const ctx = this.ctx;
            ctx.save();
            ctx.strokeStyle = this.color;
            ctx.lineWidth = 1;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(lineX, currentY);
            ctx.lineTo(lineX, lineBottomY);
            ctx.stroke();
            ctx.restore();
            const bracketHeight = fontSize * 3 * seg.rubyTotal; // 縦幅: 本文字の3倍 × 文字数
            // 括弧中心X = 本体右端 + bracketWidth/2
            const bracketCx = charCx + fontSize / 2 + bracketWidth / 2;
            this._drawReadBracket(bracketCx, currentY, bracketHeight, bracketGlyphSize);

            // showAnswer のときルビを括弧の右側に表示
            if (this.showAnswer && seg.ruby !== null) {
              const groupHeight = step * seg.rubyTotal;
              const rubyCx = charCx + fontSize / 2 + bracketWidth + rubySize * 0.6;
              this._drawRubyAt(seg.ruby, rubyCx, cy, groupHeight, fontSize, rubySize);
            }
          }

          currentY += step;
          break;
        }

        case 'bracketBox': {
          const bracketHeight = (seg.boxCount ?? 3) * boxSize;
          const bracketGap = bracketBoxGlyphSize / 2;
          // currentY = ギャップの上端、topY = 括弧の上端
          const topY = currentY + bracketGap;
          const bracketCx = x - columnWidth + bracketWidth / 2;
          this._drawBracketBox(bracketCx, topY, bracketHeight, bracketBoxGlyphSize);

          // 空白部分の右側に縦線
          {
            const lineX = x - columnWidth + bracketWidth;
            const ctx = this.ctx;
            ctx.save();
            ctx.strokeStyle = this.color;
            ctx.lineWidth = 1;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(lineX, topY);
            ctx.lineTo(lineX, topY + bracketHeight);
            ctx.stroke();
            ctx.restore();
          }

          // showAnswer のとき括弧内に文字を描画
          if (this.showAnswer) {
            const chars = [...seg.char];
            const charStep = bracketHeight / Math.max(chars.length, 1);
            for (let ci = 0; ci < chars.length; ci++) {
              const cy = topY + charStep * ci + charStep / 2;
              this._drawChar(chars[ci], bracketCx, cy, fontSize * 0.8);
            }
          }

          // ルビは括弧の右側
          if (seg.ruby !== null) {
            const rubyCx = x - columnWidth + bracketWidth + rubySize * 0.6;
            this._drawRubyAt(seg.ruby, rubyCx, topY, bracketHeight, 0, rubySize, rubySize * 1.5);
          }

          currentY += bracketHeight + bracketGap * 2;
          break;
        }
      }
    }

    return columnWidth;
  }

  /**
   * 複数列を右から左へ縦書きで描画する。
   * x, y は最右列の右上を指定。
   *
   * @param lines  - 列ごとのテキスト配列（記法可）
   * @param x      - 最右列の右上X座標
   * @param y      - 最右列の右上Y座標
   */
  fillTextBlock(lines: string[], x: number, y: number): void {
    let currentX = x;
    for (const line of lines) {
      const columnWidth = this.fillText(line, currentX, y);
      currentX -= columnWidth;
    }
  }

  /**
   * 1文字分のセルサイズを返す（マス目レイアウト計算用）
   */
  measureChar(): { width: number; height: number } {
    return {
      width: this._fontSize * this.columnGap,
      height: this._fontSize * this.lineHeight,
    };
  }
}
