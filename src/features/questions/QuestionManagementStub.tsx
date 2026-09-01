import { Notice } from '../../components/Notice';
import { useDatasets } from '../../hooks/useDatasets';
import { useQuestions } from '../../hooks/useQuestions';

export function QuestionManagementStub() {
  const datasets = useDatasets();
  const questions = useQuestions();

  return (
    <div>
      <p>問題管理（未実装）</p>
      {datasets.error ? (
        <Notice message={`データセットの読み込みに失敗しました: ${datasets.error}`} onRetry={datasets.reload} />
      ) : questions.error ? (
        <Notice message={`問題の読み込みに失敗しました: ${questions.error}`} onRetry={questions.reload} />
      ) : datasets.loading || questions.loading ? (
        <p>読み込み中...</p>
      ) : (
        <p>
          データセット {datasets.data?.length ?? 0} 件 / 問題 {questions.data?.length ?? 0} 件
        </p>
      )}
    </div>
  );
}
