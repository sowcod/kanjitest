// PropertiesService に保存した秘密トークンとの照合。設定方法は README(セットアップ手順)参照:
// PropertiesService.getScriptProperties().setProperty('API_TOKEN', '...')

function isAuthorized(token: string | null | undefined): boolean {
  const expected = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
  if (!expected) return true; // トークン未設定の環境では素通し(design doc通り、必須ではない)
  return token === expected;
}
