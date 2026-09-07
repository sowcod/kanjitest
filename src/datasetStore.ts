import { resolveDataSourceMode } from './remoteConfigStore.js';
import { remoteGet, remotePost } from './remoteApiClient.js';

/**
 * データセット: 問題(Question)を「漢字ワーク由来」「学校の授業由来」「試験問題由来」などに
 * 整理するためのグルーピング単位。
 */
export interface Dataset {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

/** 未分類の問題(datasetId未設定のまま移行されたもの)の受け皿となる既定データセット。 */
export const DEFAULT_DATASET_ID = 'default';
const DEFAULT_DATASET_NAME = '未分類';

interface DatasetRepository {
  list(): Promise<Dataset[]>;
  save(input: { id?: string; name: string }): Promise<Dataset>;
  remove(id: string): Promise<void>;
}

const STORAGE_KEY = 'kanji-test-datasets';

function loadAllLocal(): Dataset[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAllLocal(datasets: Dataset[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(datasets));
}

class LocalDatasetRepository implements DatasetRepository {
  async list(): Promise<Dataset[]> {
    const all = loadAllLocal();
    if (all.length > 0) return all;
    // 初回起動、またはこれまでデータセットという概念が無かった環境からの移行:
    // 既定データセットを1つ作っておく(questionStore側のdatasetId移行はこのIDを使う)。
    const now = new Date().toISOString();
    const seeded: Dataset = { id: DEFAULT_DATASET_ID, name: DEFAULT_DATASET_NAME, createdAt: now, updatedAt: now };
    saveAllLocal([seeded]);
    return [seeded];
  }

  async save(input: { id?: string; name: string }): Promise<Dataset> {
    const all = loadAllLocal();
    const now = new Date().toISOString();
    if (input.id) {
      const idx = all.findIndex(d => d.id === input.id);
      if (idx >= 0) {
        const updated: Dataset = { ...all[idx], name: input.name, updatedAt: now };
        all[idx] = updated;
        saveAllLocal(all);
        return updated;
      }
    }
    const created: Dataset = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: input.name,
      createdAt: now,
      updatedAt: now,
    };
    all.push(created);
    saveAllLocal(all);
    return created;
  }

  async remove(id: string): Promise<void> {
    saveAllLocal(loadAllLocal().filter(d => d.id !== id));
  }
}

class RemoteDatasetRepository implements DatasetRepository {
  async list(): Promise<Dataset[]> {
    const { datasets } = await remoteGet<{ datasets: Dataset[] }>('listDatasets');
    return datasets;
  }

  async save(input: { id?: string; name: string }): Promise<Dataset> {
    const { dataset } = await remotePost<{ dataset: Dataset }>('saveDataset', { dataset: input });
    return dataset;
  }

  async remove(id: string): Promise<void> {
    await remotePost('deleteDataset', { id });
  }
}

const localRepo = new LocalDatasetRepository();
const remoteRepo = new RemoteDatasetRepository();

function repo(): DatasetRepository {
  return resolveDataSourceMode() === 'remote' ? remoteRepo : localRepo;
}

function sortByCreatedAt(list: Dataset[]): Dataset[] {
  return list.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

// ────────────────────────────────────────────────────────────
// ストア: questionStore と同様にモジュールスコープの単一の状態として保持し、
// useSyncExternalStore から購読できるようにする(タブ切り替えでコンポーネントが
// unmount/remountされてもキャッシュを保持し、再取得の待ちを発生させない)。
// ────────────────────────────────────────────────────────────

let datasets: Dataset[] | null = null;
let loadError: string | null = null;
let loadPromise: Promise<Dataset[]> | null = null;

type Listener = () => void;
const listeners = new Set<Listener>();

export interface DatasetsSnapshot {
  datasets: Dataset[];
  loading: boolean;
  error: string | null;
}

const EMPTY_DATASETS: Dataset[] = [];
let cachedSnapshot: DatasetsSnapshot | null = null;

function notify(): void {
  cachedSnapshot = null;
  for (const listener of listeners) listener();
}

function startLoad(): Promise<Dataset[]> {
  const promise = repo().list().then(
    (list) => {
      loadPromise = null;
      datasets = sortByCreatedAt(list);
      loadError = null;
      notify();
      return datasets;
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
  if (datasets !== null || loadPromise !== null) return;
  startLoad().catch(() => {
    // エラーは loadError/snapshot 経由で通知済み。ここでの unhandled rejection 化を防ぐだけ。
  });
}

// タブがバックグラウンドから復帰したらキャッシュを破棄する(questionStore と同様。
// 他タブ/スプレッドシート直接編集などの取りこぼしに気付けるようにするため)。
// データセットは pending な同期状態を持たないため、questionStore のような
// 「未確定行がある間は破棄を見送る」ガードは不要。
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || datasets === null) return;
    datasets = null;
    notify();
  });
}

// ────────────────────────────────────────────────────────────
// React 用の購読API(useSyncExternalStore から使う)
// ────────────────────────────────────────────────────────────

export function subscribeDatasets(listener: Listener): () => void {
  listeners.add(listener);
  ensureLoaded();
  return () => {
    listeners.delete(listener);
  };
}

export function getDatasetsSnapshot(): DatasetsSnapshot {
  if (!cachedSnapshot) {
    cachedSnapshot = { datasets: datasets ?? EMPTY_DATASETS, loading: datasets === null, error: loadError };
  }
  return cachedSnapshot;
}

export function reloadDatasets(): void {
  datasets = null;
  loadError = null;
  notify();
  ensureLoaded();
}

/** 登録済みデータセットを一覧で返す(作成日時の昇順)。1件も無い場合は既定データセットを自動作成する。 */
export async function listDatasets(): Promise<Dataset[]> {
  if (datasets !== null) return datasets;
  return loadPromise ?? startLoad();
}

/** 新規作成または名前変更する。id を渡さない場合は新規作成する。キャッシュがあれば即時反映する。 */
export async function saveDataset(input: { id?: string; name: string }): Promise<Dataset> {
  const saved = await repo().save(input);
  if (datasets !== null) {
    const idx = datasets.findIndex((d) => d.id === saved.id);
    const next = datasets.slice();
    if (idx >= 0) next[idx] = saved;
    else next.push(saved);
    datasets = sortByCreatedAt(next);
    notify();
  }
  return saved;
}

/**
 * データセットを削除する。呼び出し側で「このデータセットに属する問題が無いこと」を
 * 確認してから呼ぶこと(問題を持つデータセットの削除は questionStore 側のデータを孤立させるため)。
 * キャッシュがあれば即時反映する。
 */
export async function deleteDataset(id: string): Promise<void> {
  await repo().remove(id);
  if (datasets !== null) {
    datasets = datasets.filter((d) => d.id !== id);
    notify();
  }
}
