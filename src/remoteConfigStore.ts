/**
 * 外部DB(Google Sheets x GAS API)への接続設定。
 *
 * この設定自体は常にブラウザのLocalStorageにのみ置く(接続先を覚えておくためのメタ情報であり、
 * 「データそのもの」ではないため同期は不要)。詳細な通信仕様は remote-api-design.md を参照。
 */
export interface RemoteConfig {
  /** GAS Web AppのURL(例: https://script.google.com/macros/s/XXXX/exec)。未設定ならローカル動作。 */
  apiUrl: string | null;
  /** GAS側で照合する簡易トークン(任意)。 */
  apiToken: string | null;
}

export type DataSourceMode = 'local' | 'remote';

const STORAGE_KEY = 'kanji-test-remote-config';

const DEFAULT_CONFIG: RemoteConfig = { apiUrl: null, apiToken: null };

export function loadRemoteConfig(): RemoteConfig {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { ...DEFAULT_CONFIG };
  try {
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveRemoteConfig(config: RemoteConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function clearRemoteConfig(): void {
  saveRemoteConfig({ ...DEFAULT_CONFIG });
}

/**
 * どちらのデータソースを使うか決定する。
 *
 * 1. URLパラメータ `?ds=local` / `?ds=remote` があれば最優先(特別対応の切替口。保存されず、そのページロード限り)
 * 2. それ以外は接続先URLが登録されていれば 'remote'、未登録なら 'local'(従来どおりの既定動作)
 */
export function resolveDataSourceMode(): DataSourceMode {
  const override = new URLSearchParams(location.search).get('ds');
  if (override === 'local' || override === 'remote') return override;
  return loadRemoteConfig().apiUrl ? 'remote' : 'local';
}
