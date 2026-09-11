import { useState } from 'react';
import { deleteDataset, saveDataset, type Dataset } from '../datasetStore';
import { loadSettings, saveSettings } from '../settingsStore';

export type DatasetActionKind = 'new' | 'rename' | 'delete';

export interface UseDatasetActions {
  busy: DatasetActionKind | null;
  error: string | null;
  createDataset(name: string): Promise<Dataset | undefined>;
  renameDataset(id: string, name: string): Promise<void>;
  removeDataset(id: string): Promise<void>;
}

async function run<T>(
  kind: DatasetActionKind,
  setBusy: (kind: DatasetActionKind | null) => void,
  setError: (error: string | null) => void,
  action: () => Promise<T>,
): Promise<T | undefined> {
  setBusy(kind);
  try {
    const result = await action();
    setError(null);
    return result;
  } catch (e) {
    setError(String(e));
    return undefined;
  } finally {
    setBusy(null);
  }
}

/** データセットの作成/名前変更/削除の実行とbusy/error状態、settingsのsourceDatasetIds追従を担う。 */
export function useDatasetActions(): UseDatasetActions {
  const [busy, setBusy] = useState<DatasetActionKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function createDataset(name: string): Promise<Dataset | undefined> {
    return run('new', setBusy, setError, async () => {
      const created = await saveDataset({ name });
      const settings = loadSettings();
      if (settings.sourceDatasetIds.length > 0) {
        saveSettings({ ...settings, sourceDatasetIds: [...settings.sourceDatasetIds, created.id] });
      }
      return created;
    });
  }

  async function renameDataset(id: string, name: string): Promise<void> {
    await run('rename', setBusy, setError, () => saveDataset({ id, name }));
  }

  async function removeDataset(id: string): Promise<void> {
    await run('delete', setBusy, setError, async () => {
      await deleteDataset(id);
      const settings = loadSettings();
      if (settings.sourceDatasetIds.includes(id)) {
        saveSettings({ ...settings, sourceDatasetIds: settings.sourceDatasetIds.filter((x) => x !== id) });
      }
    });
  }

  return { busy, error, createDataset, renameDataset, removeDataset };
}
