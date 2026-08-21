/** テスト生成の挙動を調整する設定値 */
export interface Settings {
  /** 下位学年の漢字を出題する割合（0〜1）。既定 0.2（10問中2問相当）。 */
  reviewRatio: number;
  /** 出題履歴の重み付けに使う直近テスト数。既定 10。 */
  recentHistoryCount: number;
  /** 1回のテストの問題数（weight単位の合計）。既定 10。 */
  questionsPerTest: number;
  /** 1列あたりの問題数（weight単位の合計）。既定 2。 */
  slotsPerColumn: number;
}

const STORAGE_KEY = 'kanji-test-settings';

const DEFAULT_SETTINGS: Settings = {
  reviewRatio: 0.2,
  recentHistoryCount: 10,
  questionsPerTest: 10,
  slotsPerColumn: 2,
};

export function loadSettings(): Settings {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
