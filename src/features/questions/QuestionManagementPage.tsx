import { useState } from 'react';
import { Dialog } from '../../components/Dialog';
import { Notice } from '../../components/Notice';
import { DEFAULT_DATASET_ID } from '../../datasetStore';
import { useDatasets } from '../../hooks/useDatasets';
import { useQuestionRows } from '../../hooks/useQuestions';
import { deleteQuestionOptimistic, type Row } from '../../questionStore';
import '../../styles/features.css';
import { QuestionEditorPane } from './QuestionEditorPane';
import { QuestionListPane } from './QuestionListPane';

type ModalState = { kind: 'none' } | { kind: 'confirmDeleteQuestion'; id: string };

/** 問題管理タブ本体。旧UI(index.html)の該当ロジック相当。 */
export function QuestionManagementPage() {
  const datasetsRes = useDatasets();
  const questionsRes = useQuestionRows();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [datasetFilterId, setDatasetFilterId] = useState<string>('__all__');
  const [newSessionKey, setNewSessionKey] = useState(0);
  const [modal, setModal] = useState<ModalState>({ kind: 'none' });

  const datasets = datasetsRes.data ?? [];
  const allQuestions: Row[] = questionsRes.rows;
  const editingRow = editingId ? allQuestions.find((q) => q.clientId === editingId) ?? null : null;
  const defaultDatasetId = datasetFilterId !== '__all__' ? datasetFilterId : datasets[0]?.id ?? DEFAULT_DATASET_ID;
  const editorKey = editingRow?.clientId ?? `new-${newSessionKey}`;

  function startNew() {
    setEditingId(null);
    setNewSessionKey((k) => k + 1);
  }

  function doDelete(clientId: string) {
    deleteQuestionOptimistic(clientId);
    startNew();
  }

  if (datasetsRes.error) {
    return <Notice message={`データセットの読み込みに失敗しました: ${datasetsRes.error}`} onRetry={datasetsRes.reload} />;
  }
  if (datasetsRes.loading || questionsRes.loading) {
    return <p>読み込み中...</p>;
  }

  return (
    <>
      <QuestionListPane
        allQuestions={allQuestions}
        datasets={datasets}
        questionsError={questionsRes.error}
        datasetFilterId={datasetFilterId}
        onDatasetFilterChange={setDatasetFilterId}
        editingId={editingId}
        onSelectQuestion={(row) => setEditingId(row.clientId)}
        onNewQuestion={startNew}
        onRequestDeleteQuestion={(id) => setModal({ kind: 'confirmDeleteQuestion', id })}
      />
      <QuestionEditorPane
        key={editorKey}
        editingRow={editingRow}
        datasets={datasets}
        defaultDatasetId={defaultDatasetId}
        onRequestDeleteConfirm={(id) => setModal({ kind: 'confirmDeleteQuestion', id })}
        onCancelEdit={() => setEditingId(null)}
      />

      <Dialog
        open={modal.kind === 'confirmDeleteQuestion'}
        title="確認"
        message="この問題を削除しますか？"
        danger
        onConfirm={() => {
          if (modal.kind !== 'confirmDeleteQuestion') return;
          setModal({ kind: 'none' });
          doDelete(modal.id);
        }}
        onCancel={() => setModal({ kind: 'none' })}
      />
    </>
  );
}
