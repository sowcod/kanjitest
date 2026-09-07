// LearnedKanji シート(列: currentGrade | learnedThisGrade | updatedAt)の読み書き。
// シングルトン(データ行は常に0行か1行のみ)。学年配当漢字そのものはクライアント側の
// 定数(kanjiData.ts)にあるため、ここでは「現学年」と「現学年で都度追加登録した漢字」のみ保持する。

const LEARNED_KANJI_SHEET_NAME = 'LearnedKanji';
const LEARNED_KANJI_HEADERS = ['currentGrade', 'learnedThisGrade', 'updatedAt'] as const;

const DEFAULT_LEARNED_KANJI: LearnedKanjiState = { currentGrade: 1, learnedThisGrade: [] };

function getLearnedKanjiSheet(): GoogleAppsScript.Spreadsheet.Sheet {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LEARNED_KANJI_SHEET_NAME);
  if (!sheet) throw new Error(`シート「${LEARNED_KANJI_SHEET_NAME}」が見つかりません。`);
  return sheet;
}

function rowToLearnedKanji(row: unknown[]): LearnedKanjiState {
  const grade = Number(row[0]);
  return {
    currentGrade: (grade >= 1 && grade <= 6 ? grade : 1) as LearnedKanjiState['currentGrade'],
    learnedThisGrade: JSON.parse(String(row[1] || '[]')),
  };
}

function learnedKanjiToRow(state: LearnedKanjiState, updatedAt: string): unknown[] {
  return [state.currentGrade, JSON.stringify(state.learnedThisGrade), updatedAt];
}

function getLearnedKanjiData(): LearnedKanjiState {
  const sheet = getLearnedKanjiSheet();
  if (sheet.getLastRow() < 2) return { ...DEFAULT_LEARNED_KANJI };
  const values = sheet.getRange(2, 1, 1, LEARNED_KANJI_HEADERS.length).getValues();
  return rowToLearnedKanji(values[0]);
}

function saveLearnedKanjiData(input: { currentGrade: 1 | 2 | 3 | 4 | 5 | 6; learnedThisGrade: string[] }): LearnedKanjiState {
  const sheet = getLearnedKanjiSheet();
  const now = new Date().toISOString();
  const state: LearnedKanjiState = { currentGrade: input.currentGrade, learnedThisGrade: input.learnedThisGrade };
  const row = learnedKanjiToRow(state, now);

  if (sheet.getLastRow() < 2) {
    sheet.appendRow(row);
  } else {
    sheet.getRange(2, 1, 1, LEARNED_KANJI_HEADERS.length).setValues([row]);
  }
  return state;
}
