import { parse } from './parser';
import type { Segment } from './parser';

/**
 * 縦書き描画ライブラリ
 *
 * 座標系: Canvas 2D と同じく左上原点。
 * x, y は描画ブロックの「本文字中心X・上端Y」を指定する（縦書きの起点）。
 *
 * 列レイアウト（右→左）:
 *
 *   ←左余白→[本文字]←右余白（ルビ/括弧）→
 *                ↑ x（本文字の中心X）
 *
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
  'ー', 'ｰ',
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
   * ルビをX座標を直接指定して描画する。
   *
   * @param ruby        - ルビ文字列
   * @param rubyCx      - ルビ列の中心X
   * @param groupTopY   - グループの上端Y
   * @param groupHeight - グループ全体の縦幅
   * @param rubySize    - ルビのフォントサイズ
   * @param rubyStep    - ルビの字間（省略時は rubySize）
   */
  private _drawRubyAt(
    ruby: string,
    rubyCx: number,
    groupTopY: number,
    groupHeight: number,
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
    const groupCenterY = groupTopY + groupHeight / 2;
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
   * Segment 1つ分の本文字中心からの左右オフセットを返す。
   *
   * 座標設計:
   *   ←bodyLeft→[本文字]←bodyRight（ルビ/括弧）→
   *                  ↑ x（本文字の中心X）
   *
   * ルビ・括弧は本体の右側に配置する。
   */
  private _segmentOffsets(seg: Segment): { left: number; right: number } {
    const fontSize = this._fontSize;
    const rubySize = fontSize * this.rubyRatio;
    const bracketWidth = fontSize * 3;
    switch (seg.kind) {
      case 'normal':
        return {
          left: fontSize / 2,
          right: fontSize / 2 + (seg.ruby !== null ? rubySize * 1.2 : 0),
        };
      case 'writeBox':
        return {
          left: this.boxSize / 2,
          right: this.boxSize / 2 + rubySize * 1.2,
        };
      case 'readBox':
        return {
          left: fontSize / 2,
          right: fontSize / 2 + bracketWidth,
        };
      case 'bracketBox':
        return {
          left: bracketWidth / 2,
          right: bracketWidth / 2 + rubySize * 1.2,
        };
    }
  }

  /**
   * 列幅 = max(bodyLeft) + max(bodyRight)。
   * fillText 内での配置計算に使用。
   */
  private _calcColumnWidth(segments: Segment[]): number {
    const offsets = segments.map(s => this._segmentOffsets(s));
    const maxLeft  = offsets.reduce((m, o) => Math.max(m, o.left),  0);
    const maxRight = offsets.reduce((m, o) => Math.max(m, o.right), 0);
    return maxLeft + maxRight;
  }

  /**
   * 1列（1行）を縦書きで描画する。
   * x は本文字の中心X座標、y は列の上端Y座標。
   *
   * 座標設計:
   *   ←左余白→[本文字]←右余白（ルビ/括弧）→
   *                ↑ x（本文字の中心X）
   *
   * @param text  - テキスト（記法可）
   * @param x     - 本文字の中心X座標
   * @param y     - 列の上端Y座標
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

    // 座標設計:
    //   x = 各 Segment の本体中心X（全 Segment 共通の軸）
    //   normal      の本文字中心X = x
    //   readBox     の本文字中心X = x
    //   writeBox    の枠中心X     = x
    //   bracketBox  の括弧中心X   = x（bracketWidth/2 を左右に広げる）
    const charCx = x;                         // normal / readBox の本文字中心
    const boxLeft = x - boxSize / 2;          // writeBox の枠左端
    const bracketBoxCx = x;                   // bracketBox の括弧中心

    // currentY は常に「次のセグメントの上端」
    let currentY = y;

    for (const seg of segments) {
      switch (seg.kind) {

        case 'normal': {
          const cy = currentY + fontSize / 2;
          this._drawChar(seg.char, charCx, cy, fontSize);
          if (seg.ruby !== null) {
            const groupHeight = step * seg.rubyTotal;
            const rubyCx = charCx + fontSize / 2 + rubySize * 0.6;
            this._drawRubyAt(seg.ruby, rubyCx, currentY, groupHeight, rubySize);
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
            // writeBox のルビは字間1.5倍
            this._drawRubyAt(seg.ruby, rubyCx, currentY, groupHeight, rubySize, rubySize * 1.5);
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
              this._drawRubyAt(seg.ruby, rubyCx, currentY, groupHeight, rubySize);
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
          // bracketBox の括弧中心 = x（全 Segment 共通の中心軸）
          this._drawBracketBox(bracketBoxCx, topY, bracketHeight, bracketBoxGlyphSize);

          // 空白部分の右側に縦線
          {
            const lineX = bracketBoxCx + bracketWidth / 2;
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
              this._drawChar(chars[ci], bracketBoxCx, cy, fontSize * 0.8);
            }
          }

          // ルビは括弧右端の右側
          if (seg.ruby !== null) {
            const rubyCx = bracketBoxCx + bracketWidth / 2 + rubySize * 0.6;
            this._drawRubyAt(seg.ruby, rubyCx, topY, bracketHeight, rubySize, rubySize * 1.5);
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
   * x は最右列の本文字中心X座標、y は列の上端Y座標。
   *
   * @param lines  - 列ごとのテキスト配列（記法可）
   * @param x      - 最右列の本文字中心X座標
   * @param y      - 列の上端Y座標
   */
  fillTextBlock(lines: string[], x: number, y: number): void {
    let currentX = x;
    for (let i = 0; i < lines.length; i++) {
      const bounds = this.measureText(lines[i]);
      this.fillText(lines[i], currentX, y);
      if (i + 1 < lines.length) {
        const nextBounds = this.measureText(lines[i + 1]);
        // 次列の本文字中心 = 現列の本文字中心 - (現列 bodyLeft + 次列 bodyRight)
        currentX -= bounds.bodyLeft + nextBounds.bodyRight;
      }
    }
  }

  /**
   * テキスト1列分のレイアウト情報を返す（描画は行わない）。
   *
   * 返り値:
   *   - width      : 列全体の横幅（= bodyLeft + bodyRight）
   *   - height     : 列全体の縦幅
   *   - bodyLeft   : 本文字中心から列左端までのオフセット（常に正の値）
   *   - bodyRight  : 本文字中心から列右端までのオフセット（常に正の値）
   *
   * @param text  - テキスト（記法可）
   */
  measureText(text: string): { width: number; height: number; bodyLeft: number; bodyRight: number } {
    const fontSize = this._fontSize;
    const step = fontSize * this.lineHeight;
    const boxSize = this.boxSize;
    const bracketBoxGlyphSize = fontSize * 3;

    const { segments } = parse(text);
    const offsets = segments.map(s => this._segmentOffsets(s));
    const bodyLeft  = offsets.reduce((m, o) => Math.max(m, o.left),  0);
    const bodyRight = offsets.reduce((m, o) => Math.max(m, o.right), 0);

    let height = 0;
    for (const seg of segments) {
      switch (seg.kind) {
        case 'normal':
        case 'readBox':
          height += step;
          break;
        case 'writeBox':
          height += boxSize;
          break;
        case 'bracketBox': {
          const bracketHeight = (seg.boxCount ?? 3) * boxSize;
          const bracketGap = bracketBoxGlyphSize / 2;
          height += bracketHeight + bracketGap * 2;
          break;
        }
      }
    }

    return { width: bodyLeft + bodyRight, height, bodyLeft, bodyRight };
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
