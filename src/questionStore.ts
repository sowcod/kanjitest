import { parse } from './parser.js';
import { isKanji } from './kanjiData.js';

/**
 * 問題データ
 *
 * 1問 = 1つの記法テキスト（改行を含まない、fillText に渡す1列分）。
 */
export interface Question {
  id: string;
  text: string;
  /** 1 = 通常の1問。2 = 「2問相当」の長め問題（テスト内で列を単独で占有する） */
  weight: 1 | 2;
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = 'kanji-test-questions';

function loadAll(): Question[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAll(questions: Question[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(questions));
}

/** 登録済み問題を一覧で返す（作成日時の降順） */
export function listQuestions(): Question[] {
  return loadAll().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getQuestion(id: string): Question | null {
  return loadAll().find(q => q.id === id) ?? null;
}

/** 新規登録または更新する。id を渡さない場合は新規作成する。 */
export function saveQuestion(input: { id?: string; text: string; weight: 1 | 2 }): Question {
  const all = loadAll();
  const now = new Date().toISOString();

  if (input.id) {
    const idx = all.findIndex(q => q.id === input.id);
    if (idx >= 0) {
      const updated: Question = { ...all[idx], text: input.text, weight: input.weight, updatedAt: now };
      all[idx] = updated;
      saveAll(all);
      return updated;
    }
  }

  const created: Question = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text: input.text,
    weight: input.weight,
    createdAt: now,
    updatedAt: now,
  };
  all.push(created);
  saveAll(all);
  return created;
}

export function deleteQuestion(id: string): void {
  saveAll(loadAll().filter(q => q.id !== id));
}

/** 記法を解いた見た目の文字列（一覧表示用。読みは表示せず漢字がそのまま見える形になる） */
export function plainText(text: string): string {
  const { segments } = parse(text);
  return segments.map(seg => seg.char).join('');
}

// ────────────────────────────────────────────────────────────
// 漢字抽出ヘルパー（テスト自動生成の判定ロジックで使用）
// ────────────────────────────────────────────────────────────

/**
 * 出題対象漢字: writeBox / bracketBox セグメントの char（テスト時に隠れる＝出題対象）のうち漢字のみ。
 */
export function targetKanji(text: string): Set<string> {
  const { segments } = parse(text);
  const result = new Set<string>();
  for (const seg of segments) {
    if (seg.kind === 'writeBox' || seg.kind === 'bracketBox') {
      for (const ch of seg.char) {
        if (isKanji(ch)) result.add(ch);
      }
    }
  }
  return result;
}

/**
 * 文中漢字: normal / readBox セグメントの char（常に印刷される＝文脈上見える）のうち漢字のみ。
 * readBox は漢字自体は常に印刷され、出題対象は「読み」であるためここに含める。
 */
export function bodyKanji(text: string): Set<string> {
  const { segments } = parse(text);
  const result = new Set<string>();
  for (const seg of segments) {
    if (seg.kind === 'normal' || seg.kind === 'readBox') {
      for (const ch of seg.char) {
        if (isKanji(ch)) result.add(ch);
      }
    }
  }
  return result;
}

export type QuestionKind = 'write' | 'read' | 'okurigana';

/**
 * 問題テキストに含まれる出題種別（複数あれば複合問題）。
 * writeBox（書き取り枠）→ 'write'、readBox（読み取り枠）→ 'read'、
 * bracketBox（送り仮名付き書き取り枠）→ 'okurigana'。
 */
export function questionKinds(text: string): QuestionKind[] {
  const { segments } = parse(text);
  const kinds = new Set<QuestionKind>();
  for (const seg of segments) {
    if (seg.kind === 'writeBox') kinds.add('write');
    else if (seg.kind === 'readBox') kinds.add('read');
    else if (seg.kind === 'bracketBox') kinds.add('okurigana');
  }
  return [...kinds];
}

/** 問題テキストに含まれるすべての漢字（出題対象＋文中）を返す。漢字範囲チェックに使用。 */
export function allKanji(text: string): Set<string> {
  const result = targetKanji(text);
  for (const ch of bodyKanji(text)) result.add(ch);
  return result;
}

/**
 * 「問われている」漢字（学年バランス判定に使用）:
 * writeBox / bracketBox の出題対象漢字 ＋ readBox の漢字（読みが出題対象の漢字）。
 * normal セグメントの漢字はあくまで文脈上の登場に過ぎないためここには含めない。
 */
export function testedKanji(text: string): Set<string> {
  const { segments } = parse(text);
  const result = new Set<string>();
  for (const seg of segments) {
    if (seg.kind === 'writeBox' || seg.kind === 'bracketBox' || seg.kind === 'readBox') {
      for (const ch of seg.char) {
        if (isKanji(ch)) result.add(ch);
      }
    }
  }
  return result;
}
