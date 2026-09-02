import { useDeferredValue, useMemo, useRef, useState } from 'react';
import { Notice } from '../../components/Notice';
import { QuestionLabel } from '../../components/QuestionLabel';
import { useDatasets } from '../../hooks/useDatasets';
import { useQuestions } from '../../hooks/useQuestions';
import { useSettings } from '../../hooks/useSettings';
import { computeLearnedKanjiSet, loadLearnedKanjiState } from '../../learnedKanjiStore';
import { plainText, questionGrade, type Question } from '../../questionStore';
import { countRecentUses, formatTestLabel, recordTest } from '../../testHistoryStore';
import { assignColumns, promoteAdjacentWriteKanji, selectQuestions } from '../../testGenerator';
import { Tategaki } from '../../tategaki';
import { TestPreview } from './TestPreview';
import '../../styles/features.css';

const FONT_NAME = '游教科書体';

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
}

/** 記法ではなく読める文(plainText)を対象に検索する */
function matchesQuestionSearch(q: Question, query: string): boolean {
  return plainText(q.text).toLowerCase().includes(query);
}

/** テスト生成・印刷タブ本体。旧UI(index.html)の #tab-test 相当。 */
export function TestGenerationPage() {
  const datasetsRes = useDatasets();
  const questionsRes = useQuestions();
  const { settings, updateSettings } = useSettings();

  const [manualSelectionIds, setManualSelectionIds] = useState<Set<string>>(new Set());
  const [generatedQuestionOverrides, setGeneratedQuestionOverrides] = useState<Map<string, string>>(new Map());
  const [warnings, setWarnings] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const reviewRatioRef = useRef<HTMLInputElement>(null);
  const readRatioRef = useRef<HTMLInputElement>(null);
  const okuriganaRatioRef = useRef<HTMLInputElement>(null);
  const promoteRef = useRef<HTMLInputElement>(null);
  const historyCountRef = useRef<HTMLInputElement>(null);

  const datasets = datasetsRes.data ?? [];
  const allQuestions = questionsRes.data ?? [];

  const activeSourceDatasetIds = useMemo(
    () => (settings.sourceDatasetIds.length > 0 ? settings.sourceDatasetIds : datasets.map((d) => d.id)),
    [settings.sourceDatasetIds, datasets],
  );
  const activeSourceSet = useMemo(() => new Set(activeSourceDatasetIds), [activeSourceDatasetIds]);

  const sourceFiltered = useMemo(
    () => allQuestions.filter((q) => activeSourceSet.has(q.datasetId)),
    [allQuestions, activeSourceSet],
  );
  const trimmedQuery = deferredSearchQuery.trim().toLowerCase();
  const filteredForSelect = useMemo(
    () => (trimmedQuery ? sourceFiltered.filter((q) => matchesQuestionSearch(q, trimmedQuery)) : sourceFiltered),
    [sourceFiltered, trimmedQuery],
  );

  const selectedQuestions = useMemo(() => {
    const byId = new Map(allQuestions.map((q) => [q.id, q]));
    return [...manualSelectionIds]
      .map((id) => byId.get(id))
      .filter((q): q is Question => q !== undefined)
      .map((q) => (generatedQuestionOverrides.has(q.id) ? { ...q, text: generatedQuestionOverrides.get(q.id)! } : q));
  }, [allQuestions, manualSelectionIds, generatedQuestionOverrides]);
  const selectedWeight = selectedQuestions.reduce((sum, q) => sum + q.weight, 0);

  const currentColumns = useMemo(() => {
    if (selectedQuestions.length === 0) return null;
    const measureCanvas = document.createElement('canvas');
    const measureCtx = measureCanvas.getContext('2d');
    if (!measureCtx) return null;
    const measureTategaki = new Tategaki(measureCtx, { font: `32px "${FONT_NAME}"`, lineHeight: 1.0 });
    const measureHeight = (text: string) => measureTategaki.measureText(text).height;
    return assignColumns(selectedQuestions, measureHeight, settings.slotsPerColumn).columns;
  }, [selectedQuestions, settings.slotsPerColumn]);

  function toggleDatasetFilter(id: string, checked: boolean) {
    const current = new Set(activeSourceDatasetIds);
    if (checked) current.add(id);
    else current.delete(id);
    updateSettings({ sourceDatasetIds: [...current] });
  }

  function persistTestSettings() {
    const patch = {
      reviewRatio: clamp01(Number(reviewRatioRef.current?.value)),
      readRatio: clamp01(Number(readRatioRef.current?.value)),
      okuriganaRatio: clamp01(Number(okuriganaRatioRef.current?.value)),
      promoteAdjacentWriteKanji: promoteRef.current?.checked ?? settings.promoteAdjacentWriteKanji,
      recentHistoryCount: Math.max(1, Math.round(Number(historyCountRef.current?.value) || 1)),
    };
    updateSettings(patch);
    if (reviewRatioRef.current) reviewRatioRef.current.value = String(patch.reviewRatio);
    if (readRatioRef.current) readRatioRef.current.value = String(patch.readRatio);
    if (okuriganaRatioRef.current) okuriganaRatioRef.current.value = String(patch.okuriganaRatio);
    if (historyCountRef.current) historyCountRef.current.value = String(patch.recentHistoryCount);
    return { ...settings, ...patch };
  }

  function toggleSelect(id: string) {
    setManualSelectionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function generate() {
    if (!questionsRes.data) return;
    const currentSettings = persistTestSettings();
    const learnedState = loadLearnedKanjiState();
    const learnedSet = computeLearnedKanjiSet(learnedState);
    const activeIds =
      currentSettings.sourceDatasetIds.length > 0 ? currentSettings.sourceDatasetIds : datasets.map((d) => d.id);
    const sourceQuestions = allQuestions.filter((q) => activeIds.includes(q.datasetId));
    const recentUses = countRecentUses(currentSettings.recentHistoryCount);

    const { selected, warnings: nextWarnings } = selectQuestions(
      sourceQuestions,
      learnedSet,
      learnedState.currentGrade,
      recentUses,
      currentSettings,
    );
    setWarnings(nextWarnings);
    setManualSelectionIds(new Set(selected.map((q) => q.id)));
    setGeneratedQuestionOverrides(
      new Map(
        currentSettings.promoteAdjacentWriteKanji
          ? selected.map((q): [string, string] => [q.id, promoteAdjacentWriteKanji(q.text, learnedSet)])
          : [],
      ),
    );
  }

  function clearSelection() {
    setManualSelectionIds(new Set());
    setGeneratedQuestionOverrides(new Map());
    setWarnings([]);
  }

  async function exportPdf() {
    if (!currentColumns || pdfBusy) return;
    setPdfBusy(true);
    setPdfError(null);
    try {
      const ids = currentColumns.flat().map((q) => q.id);
      const entry = recordTest(ids);
      const label = formatTestLabel(entry.date);
      const { generateTestPdf, openPdfInNewTab } = await import('../../pdfExport');
      const bytes = await generateTestPdf(currentColumns, FONT_NAME, label);
      openPdfInNewTab(bytes);
    } catch (e) {
      setPdfError(`PDFの生成に失敗しました: ${String(e)}`);
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <div className="t-panel">
      <div className="t-controls">
        <label>
          下位学年の復習割合:
          <input type="number" min={0} max={1} step={0.1} ref={reviewRatioRef} defaultValue={settings.reviewRatio} onBlur={persistTestSettings} />
        </label>
        <label>
          読み問題の割合:
          <input type="number" min={0} max={1} step={0.1} ref={readRatioRef} defaultValue={settings.readRatio} onBlur={persistTestSettings} />
        </label>
        <label>
          送り仮名問題の割合:
          <input
            type="number"
            min={0}
            max={1}
            step={0.1}
            ref={okuriganaRatioRef}
            defaultValue={settings.okuriganaRatio}
            onBlur={persistTestSettings}
          />
        </label>
        <label title="書き問題に隣接する、既習済みでルビ付きの漢字も書き問題にします。ひらがなや句読点を挟むと連鎖しません。">
          <input type="checkbox" ref={promoteRef} checked={settings.promoteAdjacentWriteKanji} onChange={persistTestSettings} />{' '}
          隣接する既習漢字を昇格
        </label>
        <label>
          直近何回分を重複判定に使うか:
          <input
            type="number"
            min={1}
            step={1}
            ref={historyCountRef}
            defaultValue={settings.recentHistoryCount}
            onBlur={persistTestSettings}
          />
        </label>
        <button type="button" className="btn btn-primary" onClick={generate}>
          ランダム生成
        </button>
        <button type="button" className="btn" onClick={clearSelection}>
          選択をクリア(白紙から作る)
        </button>
        <button type="button" className="btn" disabled={!currentColumns || pdfBusy} onClick={() => void exportPdf()}>
          {pdfBusy ? '生成中…' : 'PDFを開く(印刷用)'}
        </button>
        {pdfError ? <Notice message={pdfError} /> : null}
      </div>

      <div className="t-select-pane">
        <div className="t-select-header">
          問題を選ぶ({selectedWeight}/{settings.questionsPerTest})
        </div>
        <div className="t-dataset-filter">
          <div className="t-dataset-filter-title">出題元データセット</div>
          {datasets.map((d) => (
            <label key={d.id}>
              <input
                type="checkbox"
                checked={activeSourceSet.has(d.id)}
                onChange={(e) => toggleDatasetFilter(d.id, e.currentTarget.checked)}
              />
              {d.name}
            </label>
          ))}
        </div>
        <div className="q-search-wrap">
          <input
            type="search"
            placeholder="文で検索して追加/外す"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.currentTarget.value)}
          />
        </div>
        <ul className="t-select-list" tabIndex={0}>
          {questionsRes.error ? (
            <li className="q-empty">外部DBへの接続に失敗しました: {questionsRes.error}</li>
          ) : filteredForSelect.length === 0 ? (
            <li className="q-empty">
              {allQuestions.length === 0
                ? '問題がまだありません。「問題管理」タブで登録してください。'
                : '検索条件に一致する問題がありません。'}
            </li>
          ) : (
            filteredForSelect.map((q) => {
              const included = manualSelectionIds.has(q.id);
              const grade = questionGrade(q.text);
              return (
                <li key={q.id} className={included ? 'selected' : undefined} onClick={() => toggleSelect(q.id)}>
                  <span className="t-select-check">{included ? '✓' : ''}</span>
                  <span className="q-label">
                    <QuestionLabel text={q.text} />
                  </span>
                  <span
                    className={`badge grade-badge${grade ? '' : ' grade-unknown'}`}
                    title={grade ? `${grade}年生で習う漢字を含む問題` : '学年配当漢字を含まないため学年を判定できません'}
                  >
                    {grade ? `${grade}年` : '―'}
                  </span>
                </li>
              );
            })
          )}
        </ul>
      </div>

      <div className="t-main">
        {warnings.length > 0 ? <Notice variant="warning" message={warnings.join('\n')} /> : null}
        <TestPreview columns={currentColumns} />
      </div>
    </div>
  );
}
