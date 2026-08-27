// Questions シート(列: id | text | weight | datasetId | createdAt | updatedAt)の読み書き。
// スクリプトはこのSheetに紐づくコンテナバインドスクリプトとして作成する想定
// (SpreadsheetApp.getActiveSpreadsheet() で直接取得できる)。

const QUESTIONS_SHEET_NAME = 'Questions';
const QUESTIONS_HEADERS = ['id', 'text', 'weight', 'datasetId', 'createdAt', 'updatedAt'] as const;

function getQuestionsSheet(): GoogleAppsScript.Spreadsheet.Sheet {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(QUESTIONS_SHEET_NAME);
  if (!sheet) throw new Error(`シート「${QUESTIONS_SHEET_NAME}」が見つかりません。`);
  return sheet;
}

function rowToQuestion(row: unknown[]): Question {
  return {
    id: String(row[0]),
    text: String(row[1]),
    weight: Number(row[2]) === 2 ? 2 : 1,
    datasetId: String(row[3]),
    createdAt: String(row[4]),
    updatedAt: String(row[5]),
  };
}

function questionToRow(q: Question): unknown[] {
  return [q.id, q.text, q.weight, q.datasetId, q.createdAt, q.updatedAt];
}

function listQuestionsData(): Question[] {
  const sheet = getQuestionsSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, QUESTIONS_HEADERS.length).getValues();
  return values.map(rowToQuestion);
}

function saveQuestionData(input: { id?: string; text: string; weight: 1 | 2; datasetId: string }): Question {
  const sheet = getQuestionsSheet();
  const now = new Date().toISOString();

  if (input.id) {
    const lastRow = sheet.getLastRow();
    for (let r = 2; r <= lastRow; r++) {
      const rowId = String(sheet.getRange(r, 1).getValue());
      if (rowId === input.id) {
        const existingCreatedAt = String(sheet.getRange(r, 5).getValue());
        const updated: Question = {
          id: input.id,
          text: input.text,
          weight: input.weight,
          datasetId: input.datasetId,
          createdAt: existingCreatedAt,
          updatedAt: now,
        };
        sheet.getRange(r, 1, 1, QUESTIONS_HEADERS.length).setValues([questionToRow(updated)]);
        return updated;
      }
    }
  }

  const created: Question = {
    id: Utilities.getUuid(),
    text: input.text,
    weight: input.weight,
    datasetId: input.datasetId,
    createdAt: now,
    updatedAt: now,
  };
  sheet.appendRow(questionToRow(created));
  return created;
}

function removeQuestionData(id: string): void {
  const sheet = getQuestionsSheet();
  const lastRow = sheet.getLastRow();
  for (let r = lastRow; r >= 2; r--) {
    if (String(sheet.getRange(r, 1).getValue()) === id) {
      sheet.deleteRow(r);
      return;
    }
  }
}

function hasQuestionsForDataset(datasetId: string): boolean {
  return listQuestionsData().some(q => q.datasetId === datasetId);
}
