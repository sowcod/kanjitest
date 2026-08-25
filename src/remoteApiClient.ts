import { loadRemoteConfig } from './remoteConfigStore.js';

/**
 * 外部DB(GAS Web App)との通信ヘルパー。詳細な契約は remote-api-design.md を参照。
 * apiUrl が未設定の状態でこれらを呼ぶのはロジックエラー(呼び出し側で resolveDataSourceMode() を確認すること)。
 */
function resolveConfig(): { apiUrl: string; apiToken: string | null } {
  const config = loadRemoteConfig();
  if (!config.apiUrl) throw new Error('外部DBのURLが設定されていません。');
  return { apiUrl: config.apiUrl, apiToken: config.apiToken };
}

export async function remoteGet<T>(action: string, params: Record<string, string> = {}): Promise<T> {
  const { apiUrl, apiToken } = resolveConfig();
  const url = new URL(apiUrl);
  url.searchParams.set('action', action);
  if (apiToken) url.searchParams.set('token', apiToken);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const res = await fetch(url.toString(), { method: 'GET' });
  if (!res.ok) throw new Error(`外部DBへの通信に失敗しました(${res.status})`);
  return (await res.json()) as T;
}

export async function remotePost<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const { apiUrl, apiToken } = resolveConfig();
  // GAS の doPost はCORSプリフライト(OPTIONSリクエスト)に正しく応答できないため、
  // プリフライトが発生しない Content-Type: text/plain で送る(GAS側は e.postData.contents をJSONとしてパースする想定)。
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, token: apiToken ?? undefined, ...body }),
  });
  if (!res.ok) throw new Error(`外部DBへの通信に失敗しました(${res.status})`);
  return (await res.json()) as T;
}
