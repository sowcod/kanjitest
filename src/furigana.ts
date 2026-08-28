/**
 * 問題登録画面の入力補助: 漢字混じりの平文（選択範囲）を、既存の縦書き記法
 * （通常ルビ / 書き取り枠 / 読み取り枠 / 送り仮名付き書き取り枠）に変換する。
 *
 * kuromoji（形態素解析、IPADIC辞書同梱）と教育漢字1026字の音訓データ
 * （kanjiReadings.ts）を使い、完全オフライン・ブラウザ内で動作する。
 * kuromoji本体はグローバル `<script>` で読み込まれる（window.kuromoji）。
 */
import { KANJI_READING_CANDIDATES } from './kanjiReadings.js';
import { isKanji } from './kanjiData.js';

declare const kuromoji: any;

export interface FuriganaResult {
  replacement: string;
  /** 置換後テキスト中、読みを直接入力できるようキャレットを置きたい相対位置（文字オフセット） */
  caretOffset?: number;
}

interface KuromojiToken {
  surface_form: string;
  /** カタカナ読み。未知語は '*' */
  reading: string;
}

interface Tokenizer {
  tokenize(text: string): KuromojiToken[];
}

let tokenizerPromise: Promise<Tokenizer> | null = null;

function getTokenizer(): Promise<Tokenizer> {
  if (!tokenizerPromise) {
    tokenizerPromise = new Promise((resolve, reject) => {
      kuromoji.builder({ dicPath: './dist/browser/kuromoji-dict/' }).build((err: unknown, tokenizer: Tokenizer) => {
        if (err) reject(err);
        else resolve(tokenizer);
      });
    });
  }
  return tokenizerPromise;
}

/** kuromoji tokenizer をバックグラウンドで初期化する。index.html読み込み時に呼んでおく。 */
export function initFurigana(): Promise<void> {
  return getTokenizer().then(() => undefined);
}

async function tokenizeText(text: string): Promise<KuromojiToken[]> {
  const tokenizer = await getTokenizer();
  return tokenizer.tokenize(text);
}

function katakanaToHiragana(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

function tokenReadingHiragana(token: KuromojiToken): string {
  if (!token.reading || token.reading === '*') return '';
  return katakanaToHiragana(token.reading);
}

function isKanaChar(ch: string): boolean {
  return /^[぀-ゟ゠-ヿー]$/.test(ch);
}

// 促音化しうる末尾（く/き/ち/つ → っ）。く=行く→行っ、き=咲き→咲っ...は稀だが、
// 一般的な学校[がっこう]・雪国[ゆきぐに]等のパターンを候補に加えるための簡易ルール。
const SOKUON_SOURCE = new Set(['く', 'き', 'ち', 'つ']);

function expandCandidates(char: string): string[] {
  const base = KANJI_READING_CANDIDATES[char] ?? [];
  const expanded = new Set(base);
  for (const r of base) {
    const last = r[r.length - 1];
    if (last && SOKUON_SOURCE.has(last)) expanded.add(r.slice(0, -1) + 'っ');
  }
  return [...expanded];
}

/**
 * kanjiRun の各文字に reading を1文字以上ずつ割り当てるバックトラッキング分割。
 * 対応する分割が見つからない場合は null（呼び出し側はグループルビにフォールバックする）。
 */
export function splitPerKanji(kanjiRun: string, reading: string): string[] | null {
  const chars = [...kanjiRun];
  const readingChars = [...reading];
  const candidatesPerChar = chars.map(expandCandidates);

  function backtrack(charIndex: number, readingIndex: number): string[] | null {
    if (charIndex === chars.length) {
      return readingIndex === readingChars.length ? [] : null;
    }
    const remainingChars = chars.length - charIndex;
    const remainingReading = readingChars.length - readingIndex;
    if (remainingReading < remainingChars) return null; // 各文字に最低1文字必要

    const candidates = candidatesPerChar[charIndex];
    const maxLen = remainingReading - (remainingChars - 1);
    for (let len = 1; len <= maxLen; len++) {
      const piece = readingChars.slice(readingIndex, readingIndex + len).join('');
      if (candidates.includes(piece)) {
        const rest = backtrack(charIndex + 1, readingIndex + len);
        if (rest !== null) return [piece, ...rest];
      }
    }
    return null;
  }

  return backtrack(0, 0);
}

/**
 * 表層形と読み（ひらがな）から、前後の送り仮名を剥がして「漢字コア＋コアの読み」を取り出す。
 * 表層のかな部分が読みの対応位置と文字として一致する範囲だけを送り仮名とみなす。
 */
function splitCore(surface: string, readingHiragana: string) {
  const s = [...surface];
  const r = [...readingHiragana];
  let start = 0;
  while (start < s.length && start < r.length && isKanaChar(s[start]) && s[start] === r[start]) start++;
  let endS = s.length;
  let endR = r.length;
  while (endS > start && endR > start && isKanaChar(s[endS - 1]) && s[endS - 1] === r[endR - 1]) {
    endS--;
    endR--;
  }
  return {
    prefix: s.slice(0, start).join(''),
    core: s.slice(start, endS).join(''),
    coreReading: r.slice(start, endR).join(''),
    suffix: s.slice(endS).join(''),
  };
}

interface AnnotationWrappers {
  perChar: (char: string, ruby: string) => string;
  group: (core: string, ruby: string) => string;
  placeholder: (core: string) => string;
}

/** buildRuby / buildWriteBox 共通処理: トークンごとにコアを分割し、割り当てられたら1文字ずつ、できなければグループでラップする。 */
async function buildAnnotated(text: string, wrap: AnnotationWrappers): Promise<FuriganaResult> {
  const tokens = await tokenizeText(text);
  let out = '';
  let caretOffset: number | undefined;

  function emit(piece: string, isPlaceholder: boolean) {
    if (isPlaceholder && caretOffset === undefined) caretOffset = out.length + piece.indexOf('[') + 1;
    out += piece;
  }

  for (const token of tokens) {
    const surface = token.surface_form;
    if (![...surface].some(isKanji)) {
      out += surface;
      continue;
    }
    const reading = tokenReadingHiragana(token);
    if (!reading) {
      emit(wrap.placeholder(surface), true);
      continue;
    }
    const { prefix, core, coreReading, suffix } = splitCore(surface, reading);
    out += prefix;
    if (!coreReading) {
      emit(wrap.placeholder(core), true);
    } else {
      const perChar = splitPerKanji(core, coreReading);
      if (perChar) {
        const coreChars = [...core];
        for (let i = 0; i < coreChars.length; i++) out += wrap.perChar(coreChars[i], perChar[i]);
      } else {
        out += wrap.group(core, coreReading);
      }
    }
    out += suffix;
  }
  return { replacement: out, caretOffset };
}

/** ふりがなをつける（通常ルビ）: X[r] / {X}[r]。送り仮名は文字としてそのまま残る。 */
export function buildRuby(text: string): Promise<FuriganaResult> {
  return buildAnnotated(text, {
    perChar: (c, r) => `${c}[${r}]`,
    group: (c, r) => `{${c}}[${r}]`,
    placeholder: (c) => `{${c}}[]`,
  });
}

/** 漢字を問題にする（書き取り枠）: <X>[r]。送り仮名は枠の外に文字としてそのまま残る。 */
export function buildWriteBox(text: string): Promise<FuriganaResult> {
  return buildAnnotated(text, {
    perChar: (c, r) => `<${c}>[${r}]`,
    group: (c, r) => `<${c}>[${r}]`,
    placeholder: (c) => `<${c}>[]`,
  });
}

/** 読み仮名を問題にする（読み取り枠）: 選択範囲全体を常に1つにまとめる。 */
export async function buildReadBox(text: string): Promise<FuriganaResult> {
  const tokens = await tokenizeText(text);
  const parts: string[] = [];
  for (const token of tokens) {
    const surface = token.surface_form;
    if (![...surface].some(isKanji)) {
      parts.push(surface);
      continue;
    }
    const reading = tokenReadingHiragana(token);
    if (!reading) {
      const piece = `{${text}}[[]]`;
      return { replacement: piece, caretOffset: piece.indexOf('[[') + 2 };
    }
    parts.push(reading);
  }
  const reading = parts.join('');
  if ([...text].length === 1) return { replacement: `${text}[[${reading}]]` };
  return { replacement: `{${text}}[[${reading}]]` };
}

/** 漢字＋送り仮名を問題にする（送り仮名付き書き取り枠）: 漢字を含むトークンだけを丸ごと {{X}}[r] にする。 */
export async function buildBracketBox(text: string): Promise<FuriganaResult> {
  const tokens = await tokenizeText(text);
  let out = '';
  let caretOffset: number | undefined;
  for (const token of tokens) {
    const surface = token.surface_form;
    if (![...surface].some(isKanji)) {
      out += surface;
      continue;
    }
    const reading = tokenReadingHiragana(token);
    const piece = reading ? `{{${surface}}}[${reading}]` : `{{${surface}}}[]`;
    if (!reading && caretOffset === undefined) caretOffset = out.length + piece.indexOf('[') + 1;
    out += piece;
  }
  return { replacement: out, caretOffset };
}
