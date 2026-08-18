import type { CanvasRenderingContext2D } from 'canvas';

/**
 * 縦書き描画ライブラリ
 *
 * 座標系: Canvas 2D と同じく左上原点。
 * x, y は描画ブロックの「右上」を指定する（縦書きの起点）。
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
}

interface Segment {
  char: string;
  /** グループのルビ文字列（グループ先頭文字のみ非null、それ以外null） */
  ruby: string | null;
  /** グループ内の何文字目か (0始まり) */
  rubyIndex: number;
  /** グループの本文字数 */
  rubyTotal: number;
}

export class Tategaki {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly font: string;
  private readonly lineHeight: number;
  private readonly columnGap: number;
  private readonly color: string;
  private readonly rubyRatio: number;
  private readonly _fontSize: number;

  constructor(ctx: CanvasRenderingContext2D, options: TategakiOptions = {}) {
    this.ctx = ctx;
    this.font = options.font ?? '40px sans-serif';
    this.lineHeight = options.lineHeight ?? 1.1;
    this.columnGap = options.columnGap ?? 1.6;
    this.color = options.color ?? '#000000';
    this.rubyRatio = options.rubyRatio ?? 0.5;
    this._fontSize = this._parseFontSize(this.font);
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
   * テキストをパースしてセグメント配列に変換する。
   *
   * ふりがな記法:
   *   1文字: 漢字[かんじ]
   *   複数文字グループ: {明日}[あした]
   */
  private _parseRuby(text: string): Segment[] {
    const segments: Segment[] = [];
    // {グループ}[ruby] / 1文字[ruby] / ルビなし文字 の3パターン
    const re = /\{([^}]+)\}\[([^\]]+)\]|(.)\[([^\]]+)\]|(.)/gu;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      if (match[1] !== undefined) {
        // {グループ}[ruby]: 複数文字グループルビ
        const base = [...match[1]];
        const ruby = match[2];
        for (let i = 0; i < base.length; i++) {
          segments.push({
            char: base[i],
            ruby: i === 0 ? ruby : null,
            rubyIndex: i,
            rubyTotal: base.length,
          });
        }
      } else if (match[3] !== undefined) {
        // 1文字[ruby]: 1文字ルビ
        segments.push({
          char: match[3],
          ruby: match[4],
          rubyIndex: 0,
          rubyTotal: 1,
        });
      } else {
        // ルビなし1文字
        segments.push({ char: match[5], ruby: null, rubyIndex: 0, rubyTotal: 1 });
      }
    }
    return segments;
  }

  /**
   * 1文字を縦書きで描画する内部メソッド
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
      // 90度回転して描画
      ctx.translate(cx, cy);
      ctx.rotate(Math.PI / 2);
      ctx.fillText(ch, 0, 0);
    } else if (PUNCTUATION_CHARS.has(ch)) {
      // 句読点: グリフが左下基準のため右端に寄せ、セルの上端近くに配置する
      ctx.textAlign = 'left';
      ctx.fillText(ch, cx + fontSize * 0.5 - fontSize * 0.1, cy - fontSize * 0.7);
    } else if (SMALL_CHARS.has(ch)) {
      // 小文字: 中央揃えのまま右上にシフト
      ctx.fillText(ch, cx + fontSize * 0.1, cy - fontSize * 0.1);
    } else {
      ctx.fillText(ch, cx, cy);
    }
    ctx.restore();
  }

  /**
   * 1列（1行）を縦書きで描画する。
   * x, y は列の右上を指定。
   *
   * @param text  - テキスト（ふりがな記法可: 漢字[かんじ]）
   * @param x     - 列右上のX座標
   * @param y     - 列右上のY座標
   */
  fillText(text: string, x: number, y: number): void {
    const fontSize = this._fontSize;
    const rubySize = fontSize * this.rubyRatio;
    const step = fontSize * this.lineHeight;

    // ふりがながある場合、列幅が広がる
    const segments = this._parseRuby(text);
    const hasRuby = segments.some(s => s.ruby !== null);
    const rubyOffset = hasRuby ? rubySize * 1.2 : 0;

    // 本文の中心X（ふりがなの分だけ左にずらす）
    const charCx = x - rubyOffset - fontSize / 2;

    let currentY = y + fontSize / 2;

    for (const seg of segments) {
      this._drawChar(seg.char, charCx, currentY, fontSize);

      if (seg.ruby !== null) {
        // グループ全体の縦幅の中央にルビを均等配置する
        const groupHeight = step * seg.rubyTotal;
        this._drawRuby(seg.ruby, charCx, currentY, groupHeight, fontSize, rubySize);
      }

      currentY += step;
    }
  }

  /**
   * ふりがなを描画する内部メソッド
   * @param ruby        - ふりがな文字列
   * @param charCx      - 本文字の中心X
   * @param groupTopCy  - グループ先頭文字の中心Y
   * @param groupHeight - グループ全体の縦幅（step × 文字数）
   * @param fontSize
   * @param rubySize
   */
  private _drawRuby(
    ruby: string,
    charCx: number,
    groupTopCy: number,
    groupHeight: number,
    fontSize: number,
    rubySize: number,
  ): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = this._replaceFontSize(this.font, rubySize);
    ctx.fillStyle = this.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const rubyCx = charCx + fontSize / 2 + rubySize / 2 + 2;

    // グループ全体の縦幅の中央にルビ全体を均等配置する
    const rubyChars = [...ruby];
    const totalRubyHeight = rubySize * rubyChars.length;
    const groupCenterY = groupTopCy + (groupHeight - fontSize) / 2;
    let ry = groupCenterY - totalRubyHeight / 2 + rubySize / 2;

    for (const rch of rubyChars) {
      ctx.fillText(rch, rubyCx, ry);
      ry += rubySize;
    }
    ctx.restore();
  }

  /**
   * 複数列を右から左へ縦書きで描画する。
   * x, y は最右列の右上を指定。
   *
   * @param lines  - 列ごとのテキスト配列（ふりがな記法可）
   * @param x      - 最右列の右上X座標
   * @param y      - 最右列の右上Y座標
   */
  fillTextBlock(lines: string[], x: number, y: number): void {
    const fontSize = this._fontSize;
    const columnStep = fontSize * this.columnGap;

    let currentX = x;
    for (const line of lines) {
      this.fillText(line, currentX, y);
      currentX -= columnStep;
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
