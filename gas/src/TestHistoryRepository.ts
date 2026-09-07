// TestHistory シート(列: date | questionIds | createdAt)の読み書き。
// 追記専用ログ。date が一意キー。直近 MAX_HISTORY_LENGTH 件のみ保持し、
// 保存時に古い行(先頭側)から溢れた分を削除する(クライアント側 testHistoryStore.ts の
// MAX_HISTORY_LENGTH と同じ値・同じ挙動)。

const TEST_HISTORY_SHEET_NAME = 'TestHistory';
const TEST_HISTORY_HEADERS = ['date', 'questionIds', 'createdAt'] as const;
const MAX_TEST_HISTORY_LENGTH = 50;

function getTestHistorySheet(): GoogleAppsScript.Spreadsheet.Sheet {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TEST_HISTORY_SHEET_NAME);
  if (!sheet) throw new Error(`シート「${TEST_HISTORY_SHEET_NAME}」が見つかりません。`);
  return sheet;
}

function rowToTestHistoryEntry(row: unknown[]): TestHistoryEntry {
  return {
    date: String(row[0]),
    questionIds: JSON.parse(String(row[1] || '[]')),
  };
}

function testHistoryEntryToRow(entry: TestHistoryEntry, createdAt: string): unknown[] {
  return [entry.date, JSON.stringify(entry.questionIds), createdAt];
}

function listTestHistoryData(): TestHistoryEntry[] {
  const sheet = getTestHistorySheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, TEST_HISTORY_HEADERS.length).getValues();
  return values.map(rowToTestHistoryEntry);
}

function saveTestHistoryEntryData(entry: { date: string; questionIds: string[] }): TestHistoryEntry[] {
  const sheet = getTestHistorySheet();
  const now = new Date().toISOString();
  sheet.appendRow(testHistoryEntryToRow(entry, now));

  const lastRow = sheet.getLastRow();
  const overflow = lastRow - 1 - MAX_TEST_HISTORY_LENGTH; // データ行数 - 上限
  if (overflow > 0) {
    sheet.deleteRows(2, overflow); // 先頭(最も古い行)から溢れた分を削除
  }
  return listTestHistoryData();
}

function removeTestHistoryEntryData(date: string): void {
  const sheet = getTestHistorySheet();
  const lastRow = sheet.getLastRow();
  for (let r = lastRow; r >= 2; r--) {
    if (String(sheet.getRange(r, 1).getValue()) === date) {
      sheet.deleteRow(r);
      return;
    }
  }
}
