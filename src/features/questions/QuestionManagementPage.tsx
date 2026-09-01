import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { CanvasPreview } from '../../components/CanvasPreview';
import { Dialog } from '../../components/Dialog';
import { FuriganaToolbar } from '../../components/FuriganaToolbar';
import { Notice } from '../../components/Notice';
import { PromptDialog } from '../../components/PromptDialog';
import { QuestionLabel } from '../../components/QuestionLabel';
import { DEFAULT_DATASET_ID, deleteDataset, saveDataset } from '../../datasetStore';
import { useDatasets } from '../../hooks/useDatasets';
import { useQuestions } from '../../hooks/useQuestions';
import { isMac } from '../../lib/platform';
import { deleteQuestion, findDuplicate, plainText, questionGrade, saveQuestion, type Question } from '../../questionStore';
import { loadSettings, saveSettings } from '../../settingsStore';
import '../../styles/features.css';

type ModalState =
  | { kind: 'none' }
  | { kind: 'confirmDeleteQuestion'; id: string }
  | { kind: 'confirmSaveDuplicate' }
  | { kind: 'confirmDeleteDataset'; id: string; name: string }
  | { kind: 'promptNewDataset' }
  | { kind: 'promptRenameDataset'; id: string; name: string };

/** 記法ではなく読める文(plainText)を対象に検索する */
function matchesQuestionSearch(q: Question, query: string): boolean {
  return plainText(q.text).toLowerCase().includes(query);
}

/** 問題管理タブ本体。旧UI(index.html)の該当ロジック相当。 */
export function QuestionManagementPage() {
  const datasetsRes = useDatasets();
  const questionsRes = useQuestions();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [weight, setWeight] = useState<1 | 2>(1);
  const [datasetId, setDatasetId] = useState<string>(DEFAULT_DATASET_ID);
  const [datasetFilterId, setDatasetFilterId] = useState<string>('__all__');
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [datasetError, setDatasetError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [datasetBusy, setDatasetBusy] = useState<'new' | 'rename' | 'delete' | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>({ kind: 'none' });

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const duplicateTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const datasets = datasetsRes.data ?? [];
  const allQuestions = questionsRes.data ?? [];
  const datasetFiltered = datasetFilterId === '__all__' ? allQuestions : allQuestions.filter((q) => q.datasetId === datasetFilterId);
  const trimmedQuery = deferredSearchQuery.trim().toLowerCase();
  const filteredQuestions = trimmedQuery ? datasetFiltered.filter((q) => matchesQuestionSearch(q, trimmedQuery)) : datasetFiltered;
  const countLabel = trimmedQuery ? `${filteredQuestions.length}/${datasetFiltered.length}` : String(datasetFiltered.length);
  const highlightedIndex = highlightedId ? filteredQuestions.findIndex((q) => q.id === highlightedId) : -1;

  // datasets が読み込まれた後、新規作成モードのままなら既定データセットを解決する。
  useEffect(() => {
    if (editingId === null && datasets.length > 0 && !datasets.some((d) => d.id === datasetId)) {
      setDatasetId(datasets[0].id);
    }
  }, [datasets, editingId, datasetId]);

  // 検索語が変わった時だけ、編集中の項目が絞り込み結果に残っていればハイライトを復元する
  // (データセットフィルタ変更時はこの復元を行わない。旧UIの非対称な挙動を保つ)。
  useEffect(() => {
    if (editingId && filteredQuestions.some((q) => q.id === editingId)) {
      setHighlightedId(editingId);
    } else {
      setHighlightedId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deferredSearchQuery]);

  useEffect(() => {
    if (!highlightedId || !listRef.current) return;
    const el = listRef.current.querySelector(`li[data-id="${CSS.escape(highlightedId)}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlightedId]);

  async function checkDuplicate(checkText: string, checkDatasetId: string, excludeId: string | null) {
    const trimmed = checkText.trim();
    const dup = trimmed ? await findDuplicate(trimmed, checkDatasetId, excludeId ?? undefined) : null;
    setDuplicateWarning(!!dup);
  }

  function scheduleDuplicateCheck(value: string, checkDatasetId: string) {
    clearTimeout(duplicateTimerRef.current);
    duplicateTimerRef.current = setTimeout(() => void checkDuplicate(value, checkDatasetId, editingId), 300);
  }

  function startNew() {
    setEditingId(null);
    setHighlightedId(null);
    setText('');
    if (textareaRef.current) textareaRef.current.value = '';
    setWeight(1);
    const defaultDatasetId = datasetFilterId !== '__all__' ? datasetFilterId : datasets[0]?.id ?? DEFAULT_DATASET_ID;
    setDatasetId(defaultDatasetId);
    clearTimeout(duplicateTimerRef.current);
    void checkDuplicate('', defaultDatasetId, null);
    textareaRef.current?.focus();
  }

  function loadIntoEditor(q: Question) {
    setEditingId(q.id);
    setHighlightedId(q.id);
    setText(q.text);
    if (textareaRef.current) textareaRef.current.value = q.text;
    setWeight(q.weight);
    const effectiveDatasetId = datasets.some((d) => d.id === q.datasetId) ? q.datasetId : datasetId;
    setDatasetId(effectiveDatasetId);
    clearTimeout(duplicateTimerRef.current);
    void checkDuplicate(q.text, effectiveDatasetId, q.id);
    textareaRef.current?.focus();
  }

  function handleEditorInput(e: React.FormEvent<HTMLTextAreaElement>) {
    const value = e.currentTarget.value;
    setText(value);
    scheduleDuplicateCheck(value, datasetId);
  }

  function handleFuriganaTextChange(value: string) {
    setText(value);
  }

  function handleEditorKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void doSave();
    } else if ((e.metaKey || e.ctrlKey) && e.key === 'Backspace') {
      e.preventDefault();
      if (editingId) setModal({ kind: 'confirmDeleteQuestion', id: editingId });
    } else if (e.key === 'Escape') {
      e.preventDefault();
      startNew();
    }
  }

  async function doSave(opts?: { skipDuplicateConfirm?: boolean }) {
    if (saving) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      if (!opts?.skipDuplicateConfirm) {
        const dup = await findDuplicate(trimmed, datasetId, editingId ?? undefined);
        if (dup) {
          setModal({ kind: 'confirmSaveDuplicate' });
          return;
        }
      }
      const saved = await saveQuestion({ id: editingId ?? undefined, text: trimmed, weight, datasetId });
      setEditingId(saved.id);
      setHighlightedId(saved.id);
      setEditorError(null);
      questionsRes.reload();
    } catch (e) {
      setEditorError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function doDelete(id: string) {
    if (deleting) return;
    setDeleting(true);
    try {
      await deleteQuestion(id);
      startNew();
      questionsRes.reload();
    } catch (e) {
      setEditorError(String(e));
    } finally {
      setDeleting(false);
    }
  }

  function handleListKeyDown(e: React.KeyboardEvent<HTMLUListElement>) {
    if (filteredQuestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const idx = Math.min(filteredQuestions.length - 1, highlightedIndex + 1);
      setHighlightedId(filteredQuestions[idx].id);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const idx = Math.max(0, highlightedIndex - 1);
      setHighlightedId(filteredQuestions[idx].id);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0) loadIntoEditor(filteredQuestions[highlightedIndex]);
    } else if ((e.metaKey || e.ctrlKey) && e.key === 'Backspace') {
      e.preventDefault();
      if (highlightedIndex >= 0) setModal({ kind: 'confirmDeleteQuestion', id: filteredQuestions[highlightedIndex].id });
    }
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      setSearchQuery('');
    }
  }

  function handleDatasetFilterChange(value: string) {
    setDatasetFilterId(value);
    setHighlightedId(null);
  }

  function requestCreateDataset() {
    setModal({ kind: 'promptNewDataset' });
  }

  async function handleCreateDataset(name: string) {
    setModal({ kind: 'none' });
    setDatasetBusy('new');
    try {
      const created = await saveDataset({ name });
      datasetsRes.reload();
      setDatasetFilterId(created.id);
      const settings = loadSettings();
      if (settings.sourceDatasetIds.length > 0) {
        saveSettings({ ...settings, sourceDatasetIds: [...settings.sourceDatasetIds, created.id] });
      }
      setDatasetError(null);
    } catch (e) {
      setDatasetError(String(e));
    } finally {
      setDatasetBusy(null);
    }
  }

  function requestRenameDataset() {
    if (datasetFilterId === '__all__') {
      setDatasetError('名前を変更するデータセットを選んでください。');
      return;
    }
    setModal({ kind: 'promptRenameDataset', id: datasetFilterId, name: datasets.find((d) => d.id === datasetFilterId)?.name ?? '' });
  }

  async function handleRenameDataset(id: string, name: string) {
    setModal({ kind: 'none' });
    setDatasetBusy('rename');
    try {
      await saveDataset({ id, name });
      datasetsRes.reload();
      setDatasetError(null);
    } catch (e) {
      setDatasetError(String(e));
    } finally {
      setDatasetBusy(null);
    }
  }

  function requestDeleteDataset() {
    if (datasetFilterId === '__all__') {
      setDatasetError('削除するデータセットを選んでください。');
      return;
    }
    if (datasets.length <= 1) {
      setDatasetError('最後のデータセットは削除できません。');
      return;
    }
    const inUse = allQuestions.filter((q) => q.datasetId === datasetFilterId);
    if (inUse.length > 0) {
      setDatasetError(
        `このデータセットには問題が${inUse.length}件残っているため削除できません。先に問題を別のデータセットへ移すか削除してください。`,
      );
      return;
    }
    const name = datasets.find((d) => d.id === datasetFilterId)?.name ?? datasetFilterId;
    setModal({ kind: 'confirmDeleteDataset', id: datasetFilterId, name });
  }

  async function doDeleteDataset(id: string) {
    setModal({ kind: 'none' });
    setDatasetBusy('delete');
    try {
      await deleteDataset(id);
      datasetsRes.reload();
      setDatasetFilterId('__all__');
      const settings = loadSettings();
      if (settings.sourceDatasetIds.includes(id)) {
        saveSettings({ ...settings, sourceDatasetIds: settings.sourceDatasetIds.filter((x) => x !== id) });
      }
      setDatasetError(null);
    } catch (e) {
      setDatasetError(String(e));
    } finally {
      setDatasetBusy(null);
    }
  }

  if (datasetsRes.error) {
    return <Notice message={`データセットの読み込みに失敗しました: ${datasetsRes.error}`} onRetry={datasetsRes.reload} />;
  }
  if (datasetsRes.loading || questionsRes.loading) {
    return <p>読み込み中...</p>;
  }

  return (
    <>
      <div className="q-list-pane">
        <div className="q-list-header">
          <span>登録済み問題({countLabel}件)</span>
          <button type="button" className="btn" onClick={startNew}>
            新規 (Esc)
          </button>
        </div>
        <div className="q-dataset-bar">
          <select value={datasetFilterId} onChange={(e) => handleDatasetFilterChange(e.currentTarget.value)}>
            <option value="__all__">すべて</option>
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn"
            title="データセットを新規作成"
            disabled={datasetBusy !== null}
            onClick={requestCreateDataset}
          >
            {datasetBusy === 'new' ? '作成中…' : '＋新規'}
          </button>
          <button
            type="button"
            className="btn"
            title="選択中のデータセット名を変更"
            disabled={datasetBusy !== null}
            onClick={requestRenameDataset}
          >
            {datasetBusy === 'rename' ? '変更中…' : '名前変更'}
          </button>
          <button
            type="button"
            className="btn"
            title="選択中のデータセットを削除"
            disabled={datasetBusy !== null}
            onClick={requestDeleteDataset}
          >
            {datasetBusy === 'delete' ? '削除中…' : '削除'}
          </button>
        </div>
        {datasetError ? <Notice message={datasetError} /> : null}
        <div className="q-search-wrap">
          <input
            type="search"
            placeholder="文で検索(読み方ではなく読める文)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.currentTarget.value)}
            onKeyDown={handleSearchKeyDown}
          />
        </div>
        <div className="q-legend">
          <span className="q-legend-item">
            <span className="q-legend-swatch q-char-writeBox" />
            書き取り
          </span>
          <span className="q-legend-item">
            <span className="q-legend-swatch q-char-readBox" />
            読み取り
          </span>
          <span className="q-legend-item">
            <span className="q-legend-swatch q-char-bracketBox" />
            送り仮名
          </span>
        </div>
        <ul className="q-list" tabIndex={0} ref={listRef} onKeyDown={handleListKeyDown}>
          {questionsRes.error ? (
            <li className="q-empty">外部DBへの接続に失敗しました: {questionsRes.error}</li>
          ) : filteredQuestions.length === 0 ? (
            <li className="q-empty">
              {trimmedQuery ? '検索条件に一致する問題がありません。' : '問題がまだありません。右側で新規作成してください。'}
            </li>
          ) : (
            filteredQuestions.map((q) => {
              const grade = questionGrade(q.text);
              return (
                <li
                  key={q.id}
                  data-id={q.id}
                  className={q.id === highlightedId ? 'selected' : undefined}
                  onClick={() => loadIntoEditor(q)}
                >
                  <span className="q-label">
                    <QuestionLabel text={q.text} />
                  </span>
                  <span
                    className={`badge grade-badge${grade ? '' : ' grade-unknown'}`}
                    title={grade ? `${grade}年生で習う漢字を含む問題` : '学年配当漢字を含まないため学年を判定できません'}
                  >
                    {grade ? `${grade}年` : '―'}
                  </span>
                  <span className="badge">{q.weight === 2 ? '長め' : '通常'}</span>
                </li>
              );
            })
          )}
        </ul>
      </div>
      <div className="q-edit-pane">
        <div className="q-edit-form">
          <label htmlFor="q-editor">記法テキスト(1問=1行)</label>
          <FuriganaToolbar textareaRef={textareaRef} onTextChange={handleFuriganaTextChange} onError={setEditorError} />
          <textarea
            id="q-editor"
            className="q-editor"
            ref={textareaRef}
            spellCheck={false}
            placeholder="例: 明日[あした]は <遠>[えん]足[そく]です。"
            defaultValue={text}
            onInput={handleEditorInput}
            onKeyDown={handleEditorKeyDown}
          />
          <div className="q-form-row">
            <label>
              データセット:{' '}
              <select value={datasetId} onChange={(e) => setDatasetId(e.currentTarget.value)}>
                {datasets.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <input type="radio" name="q-weight" checked={weight === 1} onChange={() => setWeight(1)} /> 通常(1問分)
            </label>
            <label>
              <input type="radio" name="q-weight" checked={weight === 2} onChange={() => setWeight(2)} /> 長め(2問分・1列を単独で使う)
            </label>
            <span className="spacer" />
            <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void doSave()}>
              {saving ? '保存中…' : `保存 (${isMac ? '⌘Enter' : 'Ctrl+Enter'})`}
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={!editingId || deleting}
              onClick={() => editingId && setModal({ kind: 'confirmDeleteQuestion', id: editingId })}
            >
              {deleting ? '削除中…' : `削除 (${isMac ? '⌘⌫' : 'Ctrl+⌫'})`}
            </button>
          </div>
          {editorError ? <Notice message={editorError} /> : null}
          {duplicateWarning ? <Notice variant="warning" message="⚠ 同じ内容の問題が既に登録されています。" /> : null}
        </div>
        <CanvasPreview text={text} onError={setEditorError} />
      </div>

      <Dialog
        open={modal.kind === 'confirmSaveDuplicate'}
        title="確認"
        message="同じ内容の問題が既に登録されています。それでも保存しますか？"
        onConfirm={() => {
          setModal({ kind: 'none' });
          void doSave({ skipDuplicateConfirm: true });
        }}
        onCancel={() => setModal({ kind: 'none' })}
      />
      <Dialog
        open={modal.kind === 'confirmDeleteQuestion'}
        title="確認"
        message="この問題を削除しますか？"
        danger
        onConfirm={() => {
          if (modal.kind !== 'confirmDeleteQuestion') return;
          setModal({ kind: 'none' });
          void doDelete(modal.id);
        }}
        onCancel={() => setModal({ kind: 'none' })}
      />
      <Dialog
        open={modal.kind === 'confirmDeleteDataset'}
        title="確認"
        message={modal.kind === 'confirmDeleteDataset' ? `データセット「${modal.name}」を削除しますか？` : ''}
        danger
        onConfirm={() => {
          if (modal.kind !== 'confirmDeleteDataset') return;
          void doDeleteDataset(modal.id);
        }}
        onCancel={() => setModal({ kind: 'none' })}
      />
      <PromptDialog
        open={modal.kind === 'promptNewDataset'}
        title="新しいデータセット名を入力してください"
        label="データセット名"
        onConfirm={(name) => void handleCreateDataset(name)}
        onCancel={() => setModal({ kind: 'none' })}
      />
      <PromptDialog
        open={modal.kind === 'promptRenameDataset'}
        title="新しいデータセット名を入力してください"
        label="データセット名"
        defaultValue={modal.kind === 'promptRenameDataset' ? modal.name : ''}
        onConfirm={(name) => {
          if (modal.kind !== 'promptRenameDataset') return;
          void handleRenameDataset(modal.id, name);
        }}
        onCancel={() => setModal({ kind: 'none' })}
      />
    </>
  );
}
