// doGet/doPost エントリポイント。契約全体は ../../remote-api-design.md を参照。
// 未捕捉例外はGoogle側の汎用HTMLエラーページ(非JSON)になってしまうため、
// 各ハンドラの本体は必ず try/catch し、失敗時も errResponse で200のJSONを返す。

function doGet(e: GoogleAppsScript.Events.DoGet): GoogleAppsScript.Content.TextOutput {
  const action = e.parameter.action;
  const token = e.parameter.token;

  if (!isAuthorized(token)) return errResponse('トークンが無効です。');

  try {
    switch (action) {
      case 'listQuestions': {
        const datasetIdsParam = e.parameter.datasetIds;
        const all = listQuestionsData();
        const filtered = datasetIdsParam
          ? all.filter(q => datasetIdsParam.split(',').includes(q.datasetId))
          : all;
        return okResponse({ questions: filtered });
      }
      case 'listDatasets':
        return okResponse({ datasets: listDatasetsData() });
      default:
        return errResponse(`不明なactionです: ${action}`);
    }
  } catch (err) {
    return errResponse(err instanceof Error ? err.message : String(err));
  }
}

function doPost(e: GoogleAppsScript.Events.DoPost): GoogleAppsScript.Content.TextOutput {
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(e.postData.contents);
  } catch {
    return errResponse('リクエストボディのJSONが不正です。');
  }

  const token = typeof body.token === 'string' ? body.token : undefined;
  if (!isAuthorized(token)) return errResponse('トークンが無効です。');

  try {
    switch (body.action) {
      case 'saveQuestion': {
        const question = body.question as { id?: string; text: string; weight: 1 | 2; datasetId: string };
        return okResponse({ question: saveQuestionData(question) });
      }
      case 'deleteQuestion': {
        removeQuestionData(String(body.id));
        return okResponse({ ok: true });
      }
      case 'saveDataset': {
        const dataset = body.dataset as { id?: string; name: string };
        return okResponse({ dataset: saveDatasetData(dataset) });
      }
      case 'deleteDataset': {
        removeDatasetData(String(body.id));
        return okResponse({ ok: true });
      }
      default:
        return errResponse(`不明なactionです: ${body.action}`);
    }
  } catch (err) {
    return errResponse(err instanceof Error ? err.message : String(err));
  }
}
