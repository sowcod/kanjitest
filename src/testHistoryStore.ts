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

export function recordTest(questionIds: string[]): void {
  const history = loadHistory();
  history.push({ date: new Date().toISOString(), questionIds });
  const trimmed = history.slice(-MAX_HISTORY_LENGTH);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
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
