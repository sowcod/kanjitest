import { useMemo, useSyncExternalStore } from 'react';
import {
  getQuestionsSnapshot,
  reloadQuestions,
  subscribeQuestions,
  type Question,
  type Row,
} from '../questionStore';
import type { AsyncResource } from './useAsyncResource';

function sortByCreatedAtDesc<T extends { createdAt: string }>(list: T[]): T[] {
  return list.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function filterByDataset<T extends { datasetId: string }>(list: T[], filter?: { datasetIds?: string[] }): T[] {
  return filter?.datasetIds?.length ? list.filter((q) => filter.datasetIds!.includes(q.datasetId)) : list;
}

/** 読み取り専用の消費側(TestGenerationPage/HistoryPageなど)向け。questionStoreのライブ更新を購読する。 */
export function useQuestions(filter?: { datasetIds?: string[] }): AsyncResource<Question[]> {
  const snapshot = useSyncExternalStore(subscribeQuestions, getQuestionsSnapshot);

  const data = useMemo(() => {
    if (snapshot.loading) return null;
    return sortByCreatedAtDesc(filterByDataset(snapshot.rows, filter));
  }, [snapshot, filter]);

  return { data, loading: snapshot.loading, error: snapshot.error, reload: reloadQuestions };
}

export interface QuestionRowsResource {
  rows: Row[];
  loading: boolean;
  error: string | null;
}

/** 問題管理画面向け。sync/confirmed を含む行そのもの(Row[])を返す。 */
export function useQuestionRows(filter?: { datasetIds?: string[] }): QuestionRowsResource {
  const snapshot = useSyncExternalStore(subscribeQuestions, getQuestionsSnapshot);

  const rows = useMemo(
    () => sortByCreatedAtDesc(filterByDataset(snapshot.rows, filter)),
    [snapshot, filter],
  );

  return { rows, loading: snapshot.loading, error: snapshot.error };
}
