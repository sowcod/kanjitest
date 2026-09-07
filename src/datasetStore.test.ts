import { beforeEach, describe, expect, it, vi } from 'vitest';

// ────────────────────────────────────────────────────────────
// datasetStore.ts はモジュールスコープの全件キャッシュを持つため、questionStore.test.ts と
// 同様にテストごとに vi.resetModules() で新しいモジュールインスタンスを取得し、
// キャッシュ汚染を避ける。実ユーザーのブラウザ localStorage には一切触れない
// (jsdom のテスト専用 localStorage のみを使用)。
// ────────────────────────────────────────────────────────────

async function freshDatasetStore() {
  vi.resetModules();
  return await import('./datasetStore');
}

beforeEach(() => {
  localStorage.clear();
});

describe('local-mode CRUD', () => {
  it('starts empty and seeds a default dataset on first listDatasets call', async () => {
    const store = await freshDatasetStore();
    const all = await store.listDatasets();
    expect(all).toEqual([{ id: store.DEFAULT_DATASET_ID, name: '未分類', createdAt: all[0].createdAt, updatedAt: all[0].updatedAt }]);
  });

  it('saveDataset creates a new dataset with an id/timestamps', async () => {
    const store = await freshDatasetStore();
    const created = await store.saveDataset({ name: 'ワーク' });
    expect(created.id).toBeTruthy();
    expect(created.name).toBe('ワーク');
    expect(created.createdAt).toBe(created.updatedAt);
  });

  it('saveDataset with an existing id renames in place', async () => {
    const store = await freshDatasetStore();
    const created = await store.saveDataset({ name: 'ワーク' });
    const renamed = await store.saveDataset({ id: created.id, name: '改名後' });
    expect(renamed.id).toBe(created.id);
    expect(renamed.name).toBe('改名後');

    const all = await store.listDatasets();
    expect(all.find((d) => d.id === created.id)?.name).toBe('改名後');
  });

  it('deleteDataset removes the dataset from subsequent listDatasets calls', async () => {
    const store = await freshDatasetStore();
    const created = await store.saveDataset({ name: 'ワーク' });
    await store.deleteDataset(created.id);
    const all = await store.listDatasets();
    expect(all.find((d) => d.id === created.id)).toBeUndefined();
  });
});

describe('モジュールスコープキャッシュ(useSyncExternalStore購読API)', () => {
  it('getDatasetsSnapshot is loading until the initial fetch resolves, then reflects the seeded dataset', async () => {
    const store = await freshDatasetStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribeDatasets(listener);

    expect(store.getDatasetsSnapshot().loading).toBe(true);
    await vi.waitFor(() => expect(store.getDatasetsSnapshot().loading).toBe(false));

    expect(store.getDatasetsSnapshot().datasets).toHaveLength(1);
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it('saveDataset updates the cached snapshot immediately, without going through a loading state', async () => {
    const store = await freshDatasetStore();
    await store.listDatasets(); // キャッシュを温める

    const created = await store.saveDataset({ name: '新規データセット' });

    // 再読込を経ずに saveDataset の戻り値がそのまま反映されているはず(loading が挟まらない)。
    const snapshot = store.getDatasetsSnapshot();
    expect(snapshot.loading).toBe(false);
    expect(snapshot.datasets.some((d) => d.id === created.id && d.name === '新規データセット')).toBe(true);
  });

  it('deleteDataset updates the cached snapshot immediately', async () => {
    const store = await freshDatasetStore();
    await store.listDatasets();
    const created = await store.saveDataset({ name: '削除対象' });

    await store.deleteDataset(created.id);

    expect(store.getDatasetsSnapshot().datasets.some((d) => d.id === created.id)).toBe(false);
  });

  it('reloadDatasets discards the cache and re-fetches from the repository', async () => {
    const store = await freshDatasetStore();
    await store.listDatasets();
    const listener = vi.fn();
    const unsubscribe = store.subscribeDatasets(listener);
    listener.mockClear();

    store.reloadDatasets();
    expect(store.getDatasetsSnapshot().loading).toBe(true);
    await vi.waitFor(() => expect(store.getDatasetsSnapshot().loading).toBe(false));
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });
});
