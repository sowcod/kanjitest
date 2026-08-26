import { parse } from './parser.js';
import { isKanji, kanjiGrade, Grade } from './kanjiData.js';
import { resolveDataSourceMode } from './remoteConfigStore.js';
import { remoteGet, remotePost } from './remoteApiClient.js';
import { DEFAULT_DATASET_ID } from './datasetStore.js';

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
  /** 所属データセット(漢字ワーク由来/学校の授業由来/試験問題由来 など問題を整理する単位) */
  datasetId: string;
  createdAt: string;
  updatedAt: string;
}

// ────────────────────────────────────────────────────────────
// データ層(外部DB切替対応): 公開API(下部)はすべて非同期。
// LocalStorage実装(既定)とリモート実装(GAS Web App、未設定時は使われない)を
// resolveDataSourceMode() で切り替える。詳細な通信仕様は remote-api-design.md 参照。
// ────────────────────────────────────────────────────────────

interface QuestionRepository {
  list(): Promise<Question[]>;
  save(input: { id?: string; text: string; weight: 1 | 2; datasetId: string }): Promise<Question>;
  remove(id: string): Promise<void>;
}

const STORAGE_KEY = 'kanji-test-questions';

function loadAllLocal(): Question[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // 旧データ(datasetId概念が無かった頃に保存された問題)を既定データセットへ移行する。
    let migrated = false;
    const withDataset: Question[] = parsed.map((q: Partial<Question>) => {
      if (q && !q.datasetId) {
        migrated = true;
        return { ...q, datasetId: DEFAULT_DATASET_ID } as Question;
      }
      return q as Question;
    });
    if (migrated) saveAllLocal(withDataset);
    return withDataset;
  } catch {
    return [];
  }
}

function saveAllLocal(questions: Question[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(questions));
}

class LocalQuestionRepository implements QuestionRepository {
  async list(): Promise<Question[]> {
    return loadAllLocal();
  }

  async save(input: { id?: string; text: string; weight: 1 | 2; datasetId: string }): Promise<Question> {
    const all = loadAllLocal();
    const now = new Date().toISOString();

    if (input.id) {
      const idx = all.findIndex(q => q.id === input.id);
      if (idx >= 0) {
        const updated: Question = {
          ...all[idx],
          text: input.text,
          weight: input.weight,
          datasetId: input.datasetId,
          updatedAt: now,
        };
        all[idx] = updated;
        saveAllLocal(all);
        return updated;
      }
    }

    const created: Question = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text: input.text,
      weight: input.weight,
      datasetId: input.datasetId,
      createdAt: now,
      updatedAt: now,
    };
    all.push(created);
    saveAllLocal(all);
    return created;
  }

  async remove(id: string): Promise<void> {
    saveAllLocal(loadAllLocal().filter(q => q.id !== id));
  }
}

class RemoteQuestionRepository implements QuestionRepository {
  async list(): Promise<Question[]> {
    const { questions } = await remoteGet<{ questions: Question[] }>('listQuestions');
    return questions;
  }

  async save(input: { id?: string; text: string; weight: 1 | 2; datasetId: string }): Promise<Question> {
    const { question } = await remotePost<{ question: Question }>('saveQuestion', { question: input });
    return question;
  }

  async remove(id: string): Promise<void> {
    await remotePost('deleteQuestion', { id });
  }
}

const localRepo = new LocalQuestionRepository();
const remoteRepo = new RemoteQuestionRepository();

function repo(): QuestionRepository {
  return resolveDataSourceMode() === 'remote' ? remoteRepo : localRepo;
}

// ────────────────────────────────────────────────────────────
// キャッシュ: 問題一覧は入力中の重複チェックなど短時間に何度も参照されるため、
// メモリ上に保持する(全件・未フィルタ)。保存/削除時はサーバー(またはローカル)への
// 書き込み成功後にキャッシュを直接パッチし、再取得はしない。
// ────────────────────────────────────────────────────────────

let cache: Question[] | null = null;

async function loadAll(): Promise<Question[]> {
  if (cache === null) cache = await repo().list();
  return cache;
}

// ────────────────────────────────────────────────────────────
// 公開API
// ────────────────────────────────────────────────────────────

/** 登録済み問題を一覧で返す（作成日時の降順）。datasetIds を渡すとそのデータセットのみに絞り込む。 */
export async function listQuestions(filter?: { datasetIds?: string[] }): Promise<Question[]> {
  const all = await loadAll();
  const filtered = filter?.datasetIds?.length ? all.filter(q => filter.datasetIds!.includes(q.datasetId)) : all;
  return filtered.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getQuestion(id: string): Promise<Question | null> {
  const all = await loadAll();
  return all.find(q => q.id === id) ?? null;
}

/** 新規登録または更新する。id を渡さない場合は新規作成する。 */
export async function saveQuestion(input: {
  id?: string;
  text: string;
  weight: 1 | 2;
  datasetId: string;
}): Promise<Question> {
  const saved = await repo().save(input);
  if (cache !== null) {
    const idx = cache.findIndex(q => q.id === saved.id);
    if (idx >= 0) cache[idx] = saved;
    else cache.push(saved);
  }
  return saved;
}

export async function deleteQuestion(id: string): Promise<void> {
  await repo().remove(id);
  if (cache !== null) cache = cache.filter(q => q.id !== id);
}

/**
 * 同一データセット内で同一内容（記法テキスト完全一致）の既存問題を探す。
 * excludeId は編集中の自分自身を除外するため。データセットが異なれば「重複」とは扱わない
 * (漢字ワーク由来と試験問題由来で同じ文が使われることは想定内のため)。
 */
export async function findDuplicate(text: string, datasetId: string, excludeId?: string): Promise<Question | null> {
  const target = text.trim();
  const all = await loadAll();
  return all.find(q => q.datasetId === datasetId && q.id !== excludeId && q.text.trim() === target) ?? null;
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

/**
 * 問題の推定学年（一覧表示用）。出題対象漢字の最大学年、無ければ文中漢字の最大学年。
 * 学年配当漢字を一つも含まない問題は null（学年不明）。
 */
export function questionGrade(text: string): Grade | null {
  const testedGrades = [...testedKanji(text)].map(kanjiGrade).filter((g): g is Grade => g !== null);
  if (testedGrades.length > 0) return Math.max(...testedGrades) as Grade;

  const bodyGrades = [...bodyKanji(text)].map(kanjiGrade).filter((g): g is Grade => g !== null);
  if (bodyGrades.length > 0) return Math.max(...bodyGrades) as Grade;

  return null;
}
