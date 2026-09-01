import { useCallback, useEffect, useRef, useState } from 'react';

interface AsyncResourceState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export interface AsyncResource<T> extends AsyncResourceState<T> {
  reload: () => void;
}

/**
 * ロード中・失敗・再読み込みを統一して扱う土台。useDatasets/useQuestions/useHistory はこれの薄いラッパー。
 * 各フックが独立した useEffect で走るため、画面側で複数フックを同時に使えば自然に並列取得になる
 * (直列 await チェーンを書かない限りウォーターフォールにならない)。
 */
export function useAsyncResource<T>(loader: () => Promise<T>): AsyncResource<T> {
  const [state, setState] = useState<AsyncResourceState<T>>({ data: null, loading: true, error: null });
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    loaderRef.current().then(
      (data) => setState({ data, loading: false, error: null }),
      (err: unknown) => setState({ data: null, loading: false, error: err instanceof Error ? err.message : String(err) }),
    );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, reload: load };
}
