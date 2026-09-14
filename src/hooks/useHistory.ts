import { useSyncExternalStore } from 'react';
import { getTestHistorySnapshot, reloadTestHistory, subscribeTestHistory, type TestHistoryEntry } from '../testHistoryStore';
import type { AsyncResource } from './useAsyncResource';

/** questionStore/datasetStore と同様にモジュールスコープのキャッシュを購読する。タブ再訪時の再取得待ちが発生しない。 */
export function useHistory(): AsyncResource<TestHistoryEntry[]> {
  const snapshot = useSyncExternalStore(subscribeTestHistory, getTestHistorySnapshot);
  return {
    data: snapshot.loading ? null : snapshot.history,
    loading: snapshot.loading,
    error: snapshot.error,
    reload: reloadTestHistory,
  };
}
