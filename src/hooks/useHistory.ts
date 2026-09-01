import { loadHistory, type TestHistoryEntry } from '../testHistoryStore';
import { useAsyncResource, type AsyncResource } from './useAsyncResource';

export function useHistory(): AsyncResource<TestHistoryEntry[]> {
  return useAsyncResource<TestHistoryEntry[]>(() => Promise.resolve(loadHistory()));
}
