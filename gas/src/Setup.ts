// 初回セットアップ用。Apps Scriptエディタで setupSheets を選んで一度だけ実行すると、
// まだ存在しないシートをヘッダー行付きで作成する(既に存在するシートは変更しない)。
// doGet/doPostからは呼ばれない(Web App経由では実行できない、手動実行専用)。

function setupSheets(): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheetWithHeaders(ss, QUESTIONS_SHEET_NAME, QUESTIONS_HEADERS);
  ensureSheetWithHeaders(ss, DATASETS_SHEET_NAME, DATASETS_HEADERS);
  ensureSheetWithHeaders(ss, LEARNED_KANJI_SHEET_NAME, LEARNED_KANJI_HEADERS);
  ensureSheetWithHeaders(ss, SETTINGS_SHEET_NAME, SETTINGS_HEADERS);
  ensureSheetWithHeaders(ss, TEST_HISTORY_SHEET_NAME, TEST_HISTORY_HEADERS);
}

function ensureSheetWithHeaders(
  ss: GoogleAppsScript.Spreadsheet.Spreadsheet,
  name: string,
  headers: readonly string[]
): void {
  if (ss.getSheetByName(name)) return;
  const sheet = ss.insertSheet(name);
  sheet.appendRow(headers.slice());
}
