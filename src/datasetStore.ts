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

/** 登録済みデータセットを一覧で返す(作成日時の昇順=作られた順)。1件も無い場合は既定データセットを自動作成する。 */
export async function listDatasets(): Promise<Dataset[]> {
  const all = await repo().list();
  return all.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** 新規作成または名前変更する。id を渡さない場合は新規作成する。 */
export async function saveDataset(input: { id?: string; name: string }): Promise<Dataset> {
  return repo().save(input);
}

/**
 * データセットを削除する。呼び出し側で「このデータセットに属する問題が無いこと」を
 * 確認してから呼ぶこと(問題を持つデータセットの削除は questionStore 側のデータを孤立させるため)。
 */
export async function deleteDataset(id: string): Promise<void> {
  return repo().remove(id);
}
