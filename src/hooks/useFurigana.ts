import { useEffect, useState } from 'react';
import { initFurigana } from '../furigana';
import { kuromojiDicPath, loadKuromoji } from '../lib/kuromojiLoader';

export interface FuriganaState {
  ready: boolean;
  error: string | null;
}

/** kuromoji本体+辞書の読み込みとふりがな変換の初期化。旧UIの initFurigana().then/catch 相当。 */
export function useFurigana(): FuriganaState {
  const [state, setState] = useState<FuriganaState>({ ready: false, error: null });

  useEffect(() => {
    let cancelled = false;
    loadKuromoji()
      .then(() => initFurigana(kuromojiDicPath()))
      .then(() => {
        if (!cancelled) setState({ ready: true, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ ready: false, error: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
