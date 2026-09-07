// Settings シート(列: reviewRatio | recentHistoryCount | questionsPerTest | slotsPerColumn |
// readRatio | okuriganaRatio | promoteAdjacentWriteKanji | sourceDatasetIds | updatedAt)の読み書き。
// シングルトン(データ行は常に0行か1行のみ)。既定値はクライアント側(settingsStore.ts)の
// DEFAULT_SETTINGS と同期を維持すること。

const SETTINGS_SHEET_NAME = 'Settings';
const SETTINGS_HEADERS = [
  'reviewRatio',
  'recentHistoryCount',
  'questionsPerTest',
  'slotsPerColumn',
  'readRatio',
  'okuriganaRatio',
  'promoteAdjacentWriteKanji',
  'sourceDatasetIds',
  'updatedAt',
] as const;

const DEFAULT_SETTINGS_GAS: Settings = {
  reviewRatio: 0.2,
  recentHistoryCount: 10,
  questionsPerTest: 10,
  slotsPerColumn: 2,
  readRatio: 0,
  okuriganaRatio: 0,
  promoteAdjacentWriteKanji: false,
  sourceDatasetIds: [],
};

function getSettingsSheet(): GoogleAppsScript.Spreadsheet.Sheet {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SETTINGS_SHEET_NAME);
  if (!sheet) throw new Error(`シート「${SETTINGS_SHEET_NAME}」が見つかりません。`);
  return sheet;
}

function rowToSettings(row: unknown[]): Settings {
  return {
    reviewRatio: Number(row[0]),
    recentHistoryCount: Number(row[1]),
    questionsPerTest: Number(row[2]),
    slotsPerColumn: Number(row[3]),
    readRatio: Number(row[4]),
    okuriganaRatio: Number(row[5]),
    promoteAdjacentWriteKanji: Boolean(row[6]),
    sourceDatasetIds: JSON.parse(String(row[7] || '[]')),
  };
}

function settingsToRow(s: Settings, updatedAt: string): unknown[] {
  return [
    s.reviewRatio,
    s.recentHistoryCount,
    s.questionsPerTest,
    s.slotsPerColumn,
    s.readRatio,
    s.okuriganaRatio,
    s.promoteAdjacentWriteKanji,
    JSON.stringify(s.sourceDatasetIds),
    updatedAt,
  ];
}

function getSettingsData(): Settings {
  const sheet = getSettingsSheet();
  if (sheet.getLastRow() < 2) return { ...DEFAULT_SETTINGS_GAS };
  const values = sheet.getRange(2, 1, 1, SETTINGS_HEADERS.length).getValues();
  return rowToSettings(values[0]);
}

function saveSettingsData(input: Settings): Settings {
  const sheet = getSettingsSheet();
  const now = new Date().toISOString();
  const row = settingsToRow(input, now);

  if (sheet.getLastRow() < 2) {
    sheet.appendRow(row);
  } else {
    sheet.getRange(2, 1, 1, SETTINGS_HEADERS.length).setValues([row]);
  }
  return input;
}
