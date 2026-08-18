/**
 * 縦書き漢字テスト記法パーサー
 *
 * 記法一覧:
 *   通常ルビ (1文字):         漢[かん]字[じ]
 *   通常ルビ (グループ):      {明日}[あした]
 *   書き取り枠:               <今日>[きょう]  <漢>[かん]<字>[じ]
 *   読み取り枠 (1文字):       肉[[にく]]
 *   読み取り枠 (グループ):    {漢字}[[かんじ]]
 *   送り仮名付き書き取り枠:   {{書く}}[かく]
 */

// ────────────────────────────────────────────────────────────
// Token
// ────────────────────────────────────────────────────────────

export type TokenKind =
  | 'ANGLE_GROUP'   // <文字列>
  | 'CURLY2_GROUP'  // {{文字列}}
  | 'CURLY1_GROUP'  // {文字列}
  | 'RUBY2'         // [[文字列]]
  | 'RUBY1'         // [文字列]
  | 'CHAR';         // それ以外の1文字

export interface Token {
  kind: TokenKind;
  /** マッチした生テキスト（括弧を含む） */
  text: string;
  /** 括弧を除いた中身 */
  value: string;
  /** 入力文字列中の開始位置（文字単位、Unicode コードポイントベース） */
  offset: number;
  /** トークンの長さ（文字単位） */
  length: number;
}

// トークナイズ用の正規表現
// 優先順位: CURLY2 > ANGLE > CURLY1 > RUBY2 > RUBY1 > CHAR
const TOKEN_RE =
  /\{\{([^}]|(?!\}\})\})*\}\}|\{\{[^}]*\}\}|<([^>]*)>|\{([^}]*)\}|\[\[([^\]]*)\]\]|\[([^\]]*)\]|(.)/gu;

/**
 * 入力テキストをトークン列に分割する。
 * エディタのシンタックスハイライトにも使用できる。
 */
export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  // Unicode コードポイント配列でオフセット管理
  const chars = [...text];
  let charOffset = 0; // chars[] 上のオフセット

  // 正規表現を文字列全体に適用するが、オフセットはコードポイント単位で管理する
  // re.exec は文字列のバイト/UTF-16 インデックスを返すため、
  // 別途コードポイント数をカウントする
  const re =
    /\{\{((?:[^}]|\}(?!\}))*)\}\}|<([^>]*)>|\{([^}]*)\}|\[\[((?:[^\]]|\](?!\]))*)\]\]|\[([^\]]*)\]|(.)/gu;

  let m: RegExpExecArray | null;
  let lastIndex = 0; // re.lastIndex の前回値（UTF-16 インデックス）

  while ((m = re.exec(text)) !== null) {
    // マッチ開始位置（UTF-16）からコードポイントオフセットに変換
    const skipped = [...text.slice(lastIndex, m.index)].length;
    charOffset += skipped;
    const matchChars = [...m[0]];
    const len = matchChars.length;

    if (m[1] !== undefined) {
      // {{文字列}} — CURLY2_GROUP
      tokens.push({ kind: 'CURLY2_GROUP', text: m[0], value: m[1], offset: charOffset, length: len });
    } else if (m[2] !== undefined) {
      // <文字列> — ANGLE_GROUP
      tokens.push({ kind: 'ANGLE_GROUP', text: m[0], value: m[2], offset: charOffset, length: len });
    } else if (m[3] !== undefined) {
      // {文字列} — CURLY1_GROUP
      tokens.push({ kind: 'CURLY1_GROUP', text: m[0], value: m[3], offset: charOffset, length: len });
    } else if (m[4] !== undefined) {
      // [[文字列]] — RUBY2
      tokens.push({ kind: 'RUBY2', text: m[0], value: m[4], offset: charOffset, length: len });
    } else if (m[5] !== undefined) {
      // [文字列] — RUBY1
      tokens.push({ kind: 'RUBY1', text: m[0], value: m[5], offset: charOffset, length: len });
    } else {
      // 1文字 — CHAR
      tokens.push({ kind: 'CHAR', text: m[0], value: m[0], offset: charOffset, length: 1 });
    }

    charOffset += len;
    lastIndex = m.index + m[0].length;
  }

  return tokens;
}

// ────────────────────────────────────────────────────────────
// Segment
// ────────────────────────────────────────────────────────────

export type SegmentKind = 'normal' | 'writeBox' | 'readBox' | 'bracketBox';

export interface Segment {
  kind: SegmentKind;
  /**
   * 常に元の文字を保持する（描画時に印刷するかどうかはオプションで制御）。
   * bracketBox は複数文字をまとめて保持する（例: '書く'）。
   */
  char: string;
  /** 常に元のルビを保持する（描画時に印刷するかどうかはオプションで制御）。 */
  ruby: string | null;
  /** グループ内の何文字目か (0始まり) */
  rubyIndex: number;
  /** グループの総文字数 */
  rubyTotal: number;
  /**
   * bracketBox のみ。縦長大括弧の縦幅を決める枠数。
   * 閾値テーブルにより文字数から算出:
   *   1〜2文字 → 3、3〜4文字 → 5、5文字以上 → 7
   */
  boxCount?: number;
}

// ────────────────────────────────────────────────────────────
// ParseResult / ParseError
// ────────────────────────────────────────────────────────────

export interface ParseError {
  /** エラー箇所の開始位置（文字単位） */
  offset: number;
  /** エラー箇所の長さ */
  length: number;
  /** エラーメッセージ */
  message: string;
}

export interface ParseResult {
  segments: Segment[];
  errors: ParseError[];
}

// ────────────────────────────────────────────────────────────
// 内部ヘルパー
// ────────────────────────────────────────────────────────────

/** bracketBox の文字数 → 枠数への変換 */
function bracketBoxCount(charCount: number): number {
  if (charCount <= 2) return 3;
  if (charCount <= 4) return 5;
  return 7;
}

// ────────────────────────────────────────────────────────────
// Parser
// ────────────────────────────────────────────────────────────

/**
 * テキストをパースして Segment 配列とエラー配列を返す。
 *
 * エラーが存在しても可能な限りパースを継続し、
 * 不正なトークンは normal な1文字として扱う。
 */
export function parse(text: string): ParseResult {
  const tokens = tokenize(text);
  const segments: Segment[] = [];
  const errors: ParseError[] = [];

  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i];

    // ────── ANGLE_GROUP → writeBox ──────
    if (tok.kind === 'ANGLE_GROUP') {
      const next = tokens[i + 1];
      if (next?.kind === 'RUBY1') {
        const base = [...tok.value];
        const ruby = next.value;
        for (let j = 0; j < base.length; j++) {
          segments.push({
            kind: 'writeBox',
            char: base[j],
            ruby: j === 0 ? ruby : null,
            rubyIndex: j,
            rubyTotal: base.length,
          });
        }
        i += 2;
      } else {
        errors.push({
          offset: tok.offset,
          length: tok.length,
          message: `<...> の直後に [ルビ] がありません`,
        });
        // フォールバック: 中身をそのまま normal として出力
        for (const ch of [...tok.value]) {
          segments.push({ kind: 'normal', char: ch, ruby: null, rubyIndex: 0, rubyTotal: 1 });
        }
        i += 1;
      }
      continue;
    }

    // ────── CURLY2_GROUP → bracketBox ──────
    if (tok.kind === 'CURLY2_GROUP') {
      const next = tokens[i + 1];
      if (next?.kind === 'RUBY1') {
        const charCount = [...tok.value].length;
        segments.push({
          kind: 'bracketBox',
          char: tok.value,
          ruby: next.value,
          rubyIndex: 0,
          rubyTotal: 1,
          boxCount: bracketBoxCount(charCount),
        });
        i += 2;
      } else {
        errors.push({
          offset: tok.offset,
          length: tok.length,
          message: `{{...}} の直後に [ルビ] がありません`,
        });
        for (const ch of [...tok.value]) {
          segments.push({ kind: 'normal', char: ch, ruby: null, rubyIndex: 0, rubyTotal: 1 });
        }
        i += 1;
      }
      continue;
    }

    // ────── CURLY1_GROUP → normal or readBox ──────
    if (tok.kind === 'CURLY1_GROUP') {
      const next = tokens[i + 1];
      if (next?.kind === 'RUBY1') {
        // グループ通常ルビ
        const base = [...tok.value];
        const ruby = next.value;
        for (let j = 0; j < base.length; j++) {
          segments.push({
            kind: 'normal',
            char: base[j],
            ruby: j === 0 ? ruby : null,
            rubyIndex: j,
            rubyTotal: base.length,
          });
        }
        i += 2;
      } else if (next?.kind === 'RUBY2') {
        // グループ読み取り枠
        const base = [...tok.value];
        const ruby = next.value;
        for (let j = 0; j < base.length; j++) {
          segments.push({
            kind: 'readBox',
            char: base[j],
            ruby: j === 0 ? ruby : null,
            rubyIndex: j,
            rubyTotal: base.length,
          });
        }
        i += 2;
      } else {
        errors.push({
          offset: tok.offset,
          length: tok.length,
          message: `{...} の直後に [ルビ] または [[ルビ]] がありません`,
        });
        for (const ch of [...tok.value]) {
          segments.push({ kind: 'normal', char: ch, ruby: null, rubyIndex: 0, rubyTotal: 1 });
        }
        i += 1;
      }
      continue;
    }

    // ────── CHAR → normal or readBox ──────
    if (tok.kind === 'CHAR') {
      const next = tokens[i + 1];
      if (next?.kind === 'RUBY1') {
        segments.push({ kind: 'normal', char: tok.value, ruby: next.value, rubyIndex: 0, rubyTotal: 1 });
        i += 2;
      } else if (next?.kind === 'RUBY2') {
        segments.push({ kind: 'readBox', char: tok.value, ruby: next.value, rubyIndex: 0, rubyTotal: 1 });
        i += 2;
      } else {
        segments.push({ kind: 'normal', char: tok.value, ruby: null, rubyIndex: 0, rubyTotal: 1 });
        i += 1;
      }
      continue;
    }

    // ────── RUBY1 / RUBY2 が単体で出現（エラー） ──────
    if (tok.kind === 'RUBY1' || tok.kind === 'RUBY2') {
      const bracket = tok.kind === 'RUBY1' ? '[...]' : '[[...]]';
      errors.push({
        offset: tok.offset,
        length: tok.length,
        message: `${bracket} の前に文字またはグループがありません`,
      });
      // フォールバック: ルビの中身をそのまま normal として出力
      for (const ch of [...tok.value]) {
        segments.push({ kind: 'normal', char: ch, ruby: null, rubyIndex: 0, rubyTotal: 1 });
      }
      i += 1;
      continue;
    }

    // 到達しないはずだが安全のため
    i += 1;
  }

  return { segments, errors };
}
