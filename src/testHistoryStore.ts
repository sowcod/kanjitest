/** テスト出題履歴（同じ問題が繰り返し出題されにくくするための重み付けに使用） */
export interface TestHistoryEntry {
  date: string; // ISO日時（生成日時）
  questionIds: string[];
}

const STORAGE_KEY = 'kanji-test-history';
/** 履歴として保持する直近テスト数の上限 */
const MAX_HISTORY_LENGTH = 50;

export function loadHistory(): TestHistoryEntry[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** テストを1件記録し、記録したエントリを返す(印刷物へのラベル印字に使うため) */
export function recordTest(questionIds: string[]): TestHistoryEntry {
  const history = loadHistory();
  const entry: TestHistoryEntry = { date: new Date().toISOString(), questionIds };
  history.push(entry);
  const trimmed = history.slice(-MAX_HISTORY_LENGTH);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  return entry;
}

/**
 * 印刷物への印字・履歴一覧表示の両方で使う表示ラベル（分単位）。
 * 印刷したテスト用紙とあとで画面上に表示する解答を対応付けるための識別子として使う。
 */
export function formatTestLabel(dateIso: string): string {
  const d = new Date(dateIso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * 直近 `recentCount` 回のテストで各問題IDが何回出題されたかを数える。
 * テスト選出時の重み付け（出現回数が多いほど選ばれにくくする）に使用する。
 */
export function countRecentUses(recentCount: number): Map<string, number> {
  const history = loadHistory().slice(-recentCount);
  const counts = new Map<string, number>();
  for (const entry of history) {
    for (const id of entry.questionIds) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return counts;
}
