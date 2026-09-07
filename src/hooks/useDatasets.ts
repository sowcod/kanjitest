import { useSyncExternalStore } from 'react';
import { getDatasetsSnapshot, reloadDatasets, subscribeDatasets, type Dataset } from '../datasetStore';
import type { AsyncResource } from './useAsyncResource';

/** questionStore と同様にモジュールスコープのキャッシュを購読する。タブ再訪時の再取得待ちが発生しない。 */
export function useDatasets(): AsyncResource<Dataset[]> {
  const snapshot = useSyncExternalStore(subscribeDatasets, getDatasetsSnapshot);
  return {
    data: snapshot.loading ? null : snapshot.datasets,
    loading: snapshot.loading,
    error: snapshot.error,
    reload: reloadDatasets,
  };
}
