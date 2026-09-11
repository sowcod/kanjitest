import { useEffect, useRef, useState } from 'react';
import { CanvasPreview } from '../../components/CanvasPreview';
import { Dialog } from '../../components/Dialog';
import { FuriganaToolbar } from '../../components/FuriganaToolbar';
import { Notice } from '../../components/Notice';
import type { Dataset } from '../../datasetStore';
import { isMac } from '../../lib/platform';
import { createQuestionOptimistic, findDuplicate, updateQuestionOptimistic, type Row } from '../../questionStore';

interface QuestionEditorPaneProps {
  editingRow: Row | null;
  datasets: Dataset[];
  defaultDatasetId: string;
  onRequestDeleteConfirm(id: string): void;
  onCancelEdit(): void;
}

/**
 * 問題編集フォーム。`key`(呼び出し側で編集対象のclientId、新規時は固定値)によって
 * 編集対象が変わるたびに丸ごとremountされることを前提にしている
 * (これにより旧UIのloadIntoEditor/startNewが行っていた手動のフィールド同期が不要になる)。
 */
export function QuestionEditorPane({ editingRow, datasets, defaultDatasetId, onRequestDeleteConfirm, onCancelEdit }: QuestionEditorPaneProps) {
  const initialDatasetId = editingRow && datasets.some((d) => d.id === editingRow.datasetId) ? editingRow.datasetId : defaultDatasetId;

  const [text, setText] = useState(editingRow?.text ?? '');
  const [weight, setWeight] = useState<1 | 2>(editingRow?.weight ?? 1);
  const [datasetId, setDatasetId] = useState(initialDatasetId);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState(false);
  const [duplicateSaveConfirm, setDuplicateSaveConfirm] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const duplicateTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  async function checkDuplicate(checkText: string, checkDatasetId: string, excludeClientId: string | null) {
    const trimmed = checkText.trim();
    const dup = trimmed ? await findDuplicate(trimmed, checkDatasetId, excludeClientId ?? undefined) : null;
    setDuplicateWarning(!!dup);
  }

  function scheduleDuplicateCheck(value: string, checkDatasetId: string) {
    clearTimeout(duplicateTimerRef.current);
    duplicateTimerRef.current = setTimeout(() => void checkDuplicate(value, checkDatasetId, editingRow?.clientId ?? null), 300);
  }

  useEffect(() => {
    void checkDuplicate(editingRow?.text ?? '', datasetId, editingRow?.clientId ?? null);
    textareaRef.current?.focus();
    return () => clearTimeout(duplicateTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetForm() {
    setText('');
    if (textareaRef.current) textareaRef.current.value = '';
    setWeight(1);
    setDatasetId(defaultDatasetId);
    setEditorError(null);
    setDuplicateWarning(false);
    clearTimeout(duplicateTimerRef.current);
    void checkDuplicate('', defaultDatasetId, null);
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
      if (editingRow) onRequestDeleteConfirm(editingRow.clientId);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (editingRow) {
        onCancelEdit();
      } else {
        resetForm();
      }
    }
  }

  async function doSave(opts?: { skipDuplicateConfirm?: boolean }) {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (!opts?.skipDuplicateConfirm) {
      const dup = await findDuplicate(trimmed, datasetId, editingRow?.clientId ?? undefined);
      if (dup) {
        setDuplicateSaveConfirm(true);
        return;
      }
    }
    setEditorError(null);
    if (editingRow === null) {
      // 新規登録: 即座にリストへ反映してすぐ次の入力を始める。DBへの登録はバックグラウンドで行う。
      createQuestionOptimistic({ text: trimmed, weight, datasetId });
      resetForm();
    } else {
      // 変更登録: 即座にリストへ反映するが、エディタは同じ項目を編集中のまま留まる。
      updateQuestionOptimistic(editingRow.clientId, { text: trimmed, weight, datasetId });
    }
  }

  return (
    <div className="q-edit-pane">
      <div className="q-edit-form">
        <div className="q-edit-mode">
          <span className={`q-mode-label ${editingRow === null ? 'q-mode-new' : 'q-mode-edit'}`}>
            {editingRow === null ? '新規登録' : '編集中'}
          </span>
          {editingRow && editingRow.sync.phase === 'failed' ? (
            <span className="q-mode-hint">前回の同期に失敗しました。保存すると再試行します。</span>
          ) : null}
        </div>
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
          <button type="button" className="btn btn-primary" onClick={() => void doSave()}>
            {editingRow === null ? `登録 (${isMac ? '⌘Enter' : 'Ctrl+Enter'})` : `更新 (${isMac ? '⌘Enter' : 'Ctrl+Enter'})`}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={!editingRow}
            onClick={() => editingRow && onRequestDeleteConfirm(editingRow.clientId)}
          >
            削除 ({isMac ? '⌘⌫' : 'Ctrl+⌫'})
          </button>
        </div>
        {editorError ? <Notice message={editorError} /> : null}
        {duplicateWarning ? <Notice variant="warning" message="⚠ 同じ内容の問題が既に登録されています。" /> : null}
      </div>
      <CanvasPreview text={text} onError={setEditorError} />

      <Dialog
        open={duplicateSaveConfirm}
        title="確認"
        message="同じ内容の問題が既に登録されています。それでも保存しますか？"
        onConfirm={() => {
          setDuplicateSaveConfirm(false);
          void doSave({ skipDuplicateConfirm: true });
        }}
        onCancel={() => setDuplicateSaveConfirm(false)}
      />
    </div>
  );
}
