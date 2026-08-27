// Datasets シート(列: id | name | createdAt | updatedAt)の読み書き。

const DATASETS_SHEET_NAME = 'Datasets';
const DATASETS_HEADERS = ['id', 'name', 'createdAt', 'updatedAt'] as const;

function getDatasetsSheet(): GoogleAppsScript.Spreadsheet.Sheet {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DATASETS_SHEET_NAME);
  if (!sheet) throw new Error(`シート「${DATASETS_SHEET_NAME}」が見つかりません。`);
  return sheet;
}

function rowToDataset(row: unknown[]): Dataset {
  return {
    id: String(row[0]),
    name: String(row[1]),
    createdAt: String(row[2]),
    updatedAt: String(row[3]),
  };
}

function datasetToRow(d: Dataset): unknown[] {
  return [d.id, d.name, d.createdAt, d.updatedAt];
}

function listDatasetsData(): Dataset[] {
  const sheet = getDatasetsSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, DATASETS_HEADERS.length).getValues();
  return values.map(rowToDataset);
}

function saveDatasetData(input: { id?: string; name: string }): Dataset {
  const sheet = getDatasetsSheet();
  const now = new Date().toISOString();

  if (input.id) {
    const lastRow = sheet.getLastRow();
    for (let r = 2; r <= lastRow; r++) {
      const rowId = String(sheet.getRange(r, 1).getValue());
      if (rowId === input.id) {
        const existingCreatedAt = String(sheet.getRange(r, 3).getValue());
        const updated: Dataset = { id: input.id, name: input.name, createdAt: existingCreatedAt, updatedAt: now };
        sheet.getRange(r, 1, 1, DATASETS_HEADERS.length).setValues([datasetToRow(updated)]);
        return updated;
      }
    }
  }

  const created: Dataset = { id: Utilities.getUuid(), name: input.name, createdAt: now, updatedAt: now };
  sheet.appendRow(datasetToRow(created));
  return created;
}

function removeDatasetData(id: string): void {
  if (hasQuestionsForDataset(id)) {
    throw new Error('このデータセットには問題が残っているため削除できません。');
  }
  const sheet = getDatasetsSheet();
  const lastRow = sheet.getLastRow();
  for (let r = lastRow; r >= 2; r--) {
    if (String(sheet.getRange(r, 1).getValue()) === id) {
      sheet.deleteRow(r);
      return;
    }
  }
}
