import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { Dialog } from '../../components/Dialog';
import { Notice } from '../../components/Notice';
import { PromptDialog } from '../../components/PromptDialog';
import { QuestionLabel } from '../../components/QuestionLabel';
import type { Dataset } from '../../datasetStore';
import { useDatasetActions } from '../../hooks/useDatasetActions';
import { plainText, questionGrade, type Question, type Row, type SyncState } from '../../questionStore';

type DatasetModalState =
  | { kind: 'none' }
  | { kind: 'promptNew' }
  | { kind: 'promptRename'; id: string; name: string }
  | { kind: 'confirmDelete'; id: string; name: string };

interface QuestionListPaneProps {
  allQuestions: Row[];
  datasets: Dataset[];
  questionsError: string | null;
  datasetFilterId: string;
  onDatasetFilterChange(value: string): void;
  editingId: string | null;
  onSelectQuestion(row: Row): void;
  onNewQuestion(): void;
  onRequestDeleteQuestion(id: string): void;
}

/** 記法ではなく読める文(plainText)を対象に検索する */
function matchesQuestionSearch(q: Question, query: string): boolean {
  return plainText(q.text).toLowerCase().includes(query);
}

/** 行の同期状態からリスト上のバッジ表示(ラベル・見出し用クラス)を決める。synced なら表示しない(平常時にノイズを増やさない)。 */
function syncBadge(sync: SyncState): { label: string; className: string } | null {
  if (sync.phase === 'synced') return null;
  if (sync.phase === 'pending') {
    const label = sync.op === 'create' ? '登録中' : sync.op === 'update' ? '更新中' : '削除中';
    return { label, className: 'status-pending' };
  }
  const label = sync.op === 'create' ? '登録失敗' : sync.op === 'update' ? '更新失敗' : '削除失敗';
  return { label, className: 'status-failed' };
}

/** 問題一覧パネル: フィルタ・検索・キーボードナビ・データセットCRUDを持つ。 */
export function QuestionListPane({
  allQuestions,
  datasets,
  questionsError,
  datasetFilterId,
  onDatasetFilterChange,
  editingId,
  onSelectQuestion,
  onNewQuestion,
  onRequestDeleteQuestion,
}: QuestionListPaneProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [datasetValidationError, setDatasetValidationError] = useState<string | null>(null);
  const [datasetModal, setDatasetModal] = useState<DatasetModalState>({ kind: 'none' });

  const datasetActions = useDatasetActions();
  const listRef = useRef<HTMLUListElement>(null);

  const datasetFiltered = datasetFilterId === '__all__' ? allQuestions : allQuestions.filter((q) => q.datasetId === datasetFilterId);
  const trimmedQuery = deferredSearchQuery.trim().toLowerCase();
  const filteredQuestions = trimmedQuery ? datasetFiltered.filter((q) => matchesQuestionSearch(q, trimmedQuery)) : datasetFiltered;
  const countLabel = trimmedQuery ? `${filteredQuestions.length}/${datasetFiltered.length}` : String(datasetFiltered.length);
  const highlightedIndex = highlightedId ? filteredQuestions.findIndex((q) => q.clientId === highlightedId) : -1;

  // 検索語が変わった時だけ、編集中の項目が絞り込み結果に残っていればハイライトを復元する
  // (データセットフィルタ変更時はこの復元を行わない。旧UIの非対称な挙動を保つ)。
  useEffect(() => {
    if (editingId && filteredQuestions.some((q) => q.clientId === editingId)) {
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

  function handleListKeyDown(e: React.KeyboardEvent<HTMLUListElement>) {
    if (filteredQuestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const idx = Math.min(filteredQuestions.length - 1, highlightedIndex + 1);
      setHighlightedId(filteredQuestions[idx].clientId);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const idx = Math.max(0, highlightedIndex - 1);
      setHighlightedId(filteredQuestions[idx].clientId);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0) {
        const row = filteredQuestions[highlightedIndex];
        setHighlightedId(row.clientId);
        onSelectQuestion(row);
      }
    } else if ((e.metaKey || e.ctrlKey) && e.key === 'Backspace') {
      e.preventDefault();
      if (highlightedIndex >= 0) onRequestDeleteQuestion(filteredQuestions[highlightedIndex].clientId);
    }
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      setSearchQuery('');
    }
  }

  function handleDatasetFilterChange(value: string) {
    onDatasetFilterChange(value);
    setHighlightedId(null);
  }

  function requestCreateDataset() {
    setDatasetModal({ kind: 'promptNew' });
  }

  async function handleCreateDataset(name: string) {
    setDatasetModal({ kind: 'none' });
    const created = await datasetActions.createDataset(name);
    if (created) {
      onDatasetFilterChange(created.id);
      setDatasetValidationError(null);
    }
  }

  function requestRenameDataset() {
    if (datasetFilterId === '__all__') {
      setDatasetValidationError('名前を変更するデータセットを選んでください。');
      return;
    }
    setDatasetModal({ kind: 'promptRename', id: datasetFilterId, name: datasets.find((d) => d.id === datasetFilterId)?.name ?? '' });
  }

  async function handleRenameDataset(id: string, name: string) {
    setDatasetModal({ kind: 'none' });
    await datasetActions.renameDataset(id, name);
    setDatasetValidationError(null);
  }

  function requestDeleteDataset() {
    if (datasetFilterId === '__all__') {
      setDatasetValidationError('削除するデータセットを選んでください。');
      return;
    }
    if (datasets.length <= 1) {
      setDatasetValidationError('最後のデータセットは削除できません。');
      return;
    }
    const inUse = allQuestions.filter((q) => q.datasetId === datasetFilterId);
    if (inUse.length > 0) {
      setDatasetValidationError(
        `このデータセットには問題が${inUse.length}件残っているため削除できません。先に問題を別のデータセットへ移すか削除してください。`,
      );
      return;
    }
    const name = datasets.find((d) => d.id === datasetFilterId)?.name ?? datasetFilterId;
    setDatasetModal({ kind: 'confirmDelete', id: datasetFilterId, name });
  }

  async function doDeleteDataset(id: string) {
    setDatasetModal({ kind: 'none' });
    await datasetActions.removeDataset(id);
    onDatasetFilterChange('__all__');
    setDatasetValidationError(null);
  }

  return (
    <div className="q-list-pane">
      <div className="q-list-header">
        <span>登録済み問題({countLabel}件)</span>
        <button type="button" className="btn" onClick={onNewQuestion}>
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
          disabled={datasetActions.busy !== null}
          onClick={requestCreateDataset}
        >
          {datasetActions.busy === 'new' ? '作成中…' : '＋新規'}
        </button>
        <button
          type="button"
          className="btn"
          title="選択中のデータセット名を変更"
          disabled={datasetActions.busy !== null}
          onClick={requestRenameDataset}
        >
          {datasetActions.busy === 'rename' ? '変更中…' : '名前変更'}
        </button>
        <button
          type="button"
          className="btn"
          title="選択中のデータセットを削除"
          disabled={datasetActions.busy !== null}
          onClick={requestDeleteDataset}
        >
          {datasetActions.busy === 'delete' ? '削除中…' : '削除'}
        </button>
      </div>
      {datasetValidationError ?? datasetActions.error ? <Notice message={(datasetValidationError ?? datasetActions.error) as string} /> : null}
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
        {questionsError ? (
          <li className="q-empty">外部DBへの接続に失敗しました: {questionsError}</li>
        ) : filteredQuestions.length === 0 ? (
          <li className="q-empty">
            {trimmedQuery ? '検索条件に一致する問題がありません。' : '問題がまだありません。右側で新規作成してください。'}
          </li>
        ) : (
          filteredQuestions.map((q) => {
            const grade = questionGrade(q.text);
            const badge = syncBadge(q.sync);
            const isPendingDelete = q.sync.phase === 'pending' && q.sync.op === 'delete';
            const isFailed = q.sync.phase === 'failed';
            const liClassNames = [
              q.clientId === highlightedId ? 'selected' : null,
              isPendingDelete ? 'status-pending-delete' : null,
              isFailed ? 'status-failed' : null,
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <li
                key={q.clientId}
                data-id={q.clientId}
                className={liClassNames || undefined}
                onClick={() => {
                  if (isPendingDelete) return;
                  setHighlightedId(q.clientId);
                  onSelectQuestion(q);
                }}
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
                {badge ? (
                  <span className={`badge ${badge.className}`} title={q.sync.phase === 'failed' ? q.sync.error : undefined}>
                    {badge.className === 'status-pending' ? <span className="spinner" aria-hidden="true" /> : null}
                    {badge.label}
                  </span>
                ) : null}
              </li>
            );
          })
        )}
      </ul>

      <Dialog
        open={datasetModal.kind === 'confirmDelete'}
        title="確認"
        message={datasetModal.kind === 'confirmDelete' ? `データセット「${datasetModal.name}」を削除しますか？` : ''}
        danger
        onConfirm={() => {
          if (datasetModal.kind !== 'confirmDelete') return;
          void doDeleteDataset(datasetModal.id);
        }}
        onCancel={() => setDatasetModal({ kind: 'none' })}
      />
      <PromptDialog
        open={datasetModal.kind === 'promptNew'}
        title="新しいデータセット名を入力してください"
        label="データセット名"
        onConfirm={(name) => void handleCreateDataset(name)}
        onCancel={() => setDatasetModal({ kind: 'none' })}
      />
      <PromptDialog
        open={datasetModal.kind === 'promptRename'}
        title="新しいデータセット名を入力してください"
        label="データセット名"
        defaultValue={datasetModal.kind === 'promptRename' ? datasetModal.name : ''}
        onConfirm={(name) => {
          if (datasetModal.kind !== 'promptRename') return;
          void handleRenameDataset(datasetModal.id, name);
        }}
        onCancel={() => setDatasetModal({ kind: 'none' })}
      />
    </div>
  );
}
