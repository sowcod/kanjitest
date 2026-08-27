// GAS Web App は正常終了したスクリプトからのレスポンスに常に HTTP 200 を返し、
// スクリプト側からステータスコードを制御することはできない(未捕捉例外時のみ
// Google側の汎用エラーページが返るが、それはJSONではない)。
// そのため成否は常に body の `error` フィールドで判定する契約にしている。

function okResponse(data: Record<string, unknown>): GoogleAppsScript.Content.TextOutput {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function errResponse(message: string): GoogleAppsScript.Content.TextOutput {
  return ContentService.createTextOutput(JSON.stringify({ error: message })).setMimeType(
    ContentService.MimeType.JSON
  );
}
