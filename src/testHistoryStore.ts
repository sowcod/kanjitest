import { resolveDataSourceMode } from './remoteConfigStore.js';
import { remoteGet, remotePost } from './remoteApiClient.js';

/** テスト出題履歴(同じ問題が繰り返し出題されにくくするための重み付けに使用) */
export interface TestHistoryEntry {
  date: string; // ISO日時(生成日時。このエントリの一意キーでもある)
  questionIds: string[];
}

/** 履歴として保持する直近テスト数の上限(ローカル/リモートどちらでも同じ挙動) */
const MAX_HISTORY_LENGTH = 50;

interface TestHistoryRepository {
  list(): Promise<TestHistoryEntry[]>;
  record(questionIds: string[]): Promise<TestHistoryEntry>;
  remove(date: string): Promise<void>;
}

const STORAGE_KEY = 'kanji-test-history';

function loadAllLocal(): TestHistoryEntry[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAllLocal(history: TestHistoryEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

class LocalTestHistoryRepository implements TestHistoryRepository {
  async list(): Promise<TestHistoryEntry[]> {
    return loadAllLocal();
  }

  async record(questionIds: string[]): Promise<TestHistoryEntry> {
    const history = loadAllLocal();
    const entry: TestHistoryEntry = { date: new Date().toISOString(), questionIds };
    history.push(entry);
    saveAllLocal(history.slice(-MAX_HISTORY_LENGTH));
    return entry;
  }

  async remove(date: string): Promise<void> {
    saveAllLocal(loadAllLocal().filter((e) => e.date !== date));
  }
}

class RemoteTestHistoryRepository implements TestHistoryRepository {
  async list(): Promise<TestHistoryEntry[]> {
    const { history } = await remoteGet<{ history: TestHistoryEntry[] }>('listTestHistory');
    return history;
  }

  async record(questionIds: string[]): Promise<TestHistoryEntry> {
    const entry: TestHistoryEntry = { date: new Date().toISOString(), questionIds };
    await remotePost<{ history: TestHistoryEntry[] }>('saveTestHistoryEntry', { entry });
    return entry;
  }

  async remove(date: string): Promise<void> {
    await remotePost('deleteTestHistoryEntry', { date });
  }
}

const localRepo = new LocalTestHistoryRepository();
const remoteRepo = new RemoteTestHistoryRepository();

function repo(): TestHistoryRepository {
  return resolveDataSourceMode() === 'remote' ? remoteRepo : localRepo;
}

function trim(history: TestHistoryEntry[]): TestHistoryEntry[] {
  return history.slice(-MAX_HISTORY_LENGTH);
}

// ────────────────────────────────────────────────────────────
// ストア: datasetStore.ts と同様にモジュールスコープの単一の状態として保持し、
// useSyncExternalStore から購読できるようにする(タブ切り替えでコンポーネントが
// unmount/remountされてもキャッシュを保持し、再取得の待ちを発生させない)。
// ────────────────────────────────────────────────────────────

let history: TestHistoryEntry[] | null = null;
let loadError: string | null = null;
let loadPromise: Promise<TestHistoryEntry[]> | null = null;

type Listener = () => void;
const listeners = new Set<Listener>();

export interface TestHistorySnapshot {
  history: TestHistoryEntry[];
  loading: boolean;
  error: string | null;
}

const EMPTY_HISTORY: TestHistoryEntry[] = [];
let cachedSnapshot: TestHistorySnapshot | null = null;

function notify(): void {
  cachedSnapshot = null;
  for (const listener of listeners) listener();
}

function startLoad(): Promise<TestHistoryEntry[]> {
  const promise = repo().list().then(
    (list) => {
      loadPromise = null;
      history = trim(list);
      loadError = null;
      notify();
      return history;
    },
    (err: unknown) => {
      loadPromise = null;
      loadError = err instanceof Error ? err.message : String(err);
      notify();
      throw err;
    },
  );
  loadPromise = promise;
  return promise;
}

/** 未読込であれば読込を開始する(副作用を起こしても安全な場所、購読開始時に呼ぶ)。 */
function ensureLoaded(): void {
  if (history !== null || loadPromise !== null) return;
  startLoad().catch(() => {
    // エラーは loadError/snapshot 経由で通知済み。ここでの unhandled rejection 化を防ぐだけ。
  });
}

// タブがバックグラウンドから復帰したらキャッシュを破棄する(datasetStore と同様。
// 他タブ/スプレッドシート直接編集などの取りこぼしに気付けるようにするため)。
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || history === null) return;
    history = null;
    notify();
  });
}

// ────────────────────────────────────────────────────────────
// React 用の購読API(useSyncExternalStore から使う)
// ────────────────────────────────────────────────────────────

export function subscribeTestHistory(listener: Listener): () => void {
  listeners.add(listener);
  ensureLoaded();
  return () => {
    listeners.delete(listener);
  };
}

export function getTestHistorySnapshot(): TestHistorySnapshot {
  if (!cachedSnapshot) {
    cachedSnapshot = { history: history ?? EMPTY_HISTORY, loading: history === null, error: loadError };
  }
  return cachedSnapshot;
}

export function reloadTestHistory(): void {
  history = null;
  loadError = null;
  notify();
  ensureLoaded();
}

// ────────────────────────────────────────────────────────────
// 公開API(既存): 直接 await して結果を受け取る素朴な版。
// ────────────────────────────────────────────────────────────

/** 履歴一覧を返す(古い順)。キャッシュがあれば即返す。 */
export async function listTestHistory(): Promise<TestHistoryEntry[]> {
  if (history !== null) return history;
  return loadPromise ?? startLoad();
}

/** テストを1件記録し、記録したエントリを返す(印刷物へのラベル印字に使うため)。キャッシュがあれば即時反映する。 */
export async function recordTest(questionIds: string[]): Promise<TestHistoryEntry> {
  const saved = await repo().record(questionIds);
  if (history !== null) {
    history = trim([...history, saved]);
    notify();
  }
  return saved;
}

/** 指定した日時(=一意キー)の履歴エントリを削除する。キャッシュがあれば即時反映する。 */
export async function deleteHistoryEntry(date: string): Promise<void> {
  await repo().remove(date);
  if (history !== null) {
    history = history.filter((e) => e.date !== date);
    notify();
  }
}

/**
 * 印刷物への印字・履歴一覧表示の両方で使う表示ラベル(分単位)。
 * 印刷したテスト用紙とあとで画面上に表示する解答を対応付けるための識別子として使う。
 */
export function formatTestLabel(dateIso: string): string {
  const d = new Date(dateIso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * 直近 `recentCount` 回のテストで各問題IDが何回出題されたかを数える。
 * テスト選出時の重み付け(出現回数が多いほど選ばれにくくする)に使用する。
 * 履歴の読込自体は呼び出し側(useHistory等)が担う(この関数は純関数)。
 */
export function countRecentUses(entries: TestHistoryEntry[], recentCount: number): Map<string, number> {
  const recent = entries.slice(-recentCount);
  const counts = new Map<string, number>();
  for (const entry of recent) {
    for (const id of entry.questionIds) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return counts;
}
