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
  /** 読み問題の目標割合（0〜1）。既定 0（基本的に書き問題のみ出す運用に合わせる）。 */
  readRatio: number;
  /** 送り仮名問題の目標割合（0〜1）。既定 0。 */
  okuriganaRatio: number;
  /**
   * テスト生成の出題元として使うデータセットIDの一覧。
   * 空配列は「まだ選択されていない」を意味し、呼び出し側(app.html)が
   * 初回だけ既知の全データセットIDで初期化して保存する(挙動を後方互換に保つため)。
   */
  sourceDatasetIds: string[];
}

const STORAGE_KEY = 'kanji-test-settings';

const DEFAULT_SETTINGS: Settings = {
  reviewRatio: 0.2,
  recentHistoryCount: 10,
  questionsPerTest: 10,
  slotsPerColumn: 2,
  readRatio: 0,
  okuriganaRatio: 0,
  sourceDatasetIds: [],
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
