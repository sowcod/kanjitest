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

/**
 * GAS Web Appは正常終了したスクリプトからのレスポンスに常に200を返すため(スクリプト側から
 * ステータスコードを制御できない)、成否は必ずボディの `error` フィールドで判定する。
 * res.ok===false になるのは、GAS側のダウン等でGoogleの汎用エラーページ(非JSON)が返る場合のみ
 * ここではその場合も同じ経路で「JSONパース失敗」として扱う。
 */
async function parseRemoteResponse<T>(res: Response): Promise<T> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Error(`外部DBへの通信に失敗しました(${res.status})`);
  }
  if (body && typeof body === 'object' && 'error' in body) {
    throw new Error(`外部DBへの通信に失敗しました: ${(body as { error: unknown }).error}`);
  }
  return body as T;
}

export async function remoteGet<T>(action: string, params: Record<string, string> = {}): Promise<T> {
  const { apiUrl, apiToken } = resolveConfig();
  const url = new URL(apiUrl);
  url.searchParams.set('action', action);
  if (apiToken) url.searchParams.set('token', apiToken);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const res = await fetch(url.toString(), { method: 'GET' });
  return parseRemoteResponse<T>(res);
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
  return parseRemoteResponse<T>(res);
}
