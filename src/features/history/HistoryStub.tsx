import { Notice } from '../../components/Notice';
import { useHistory } from '../../hooks/useHistory';

export function HistoryStub() {
  const history = useHistory();

  return (
    <div>
      <p>履歴確認（未実装）</p>
      {history.error ? (
        <Notice message={`履歴の読み込みに失敗しました: ${history.error}`} onRetry={history.reload} />
      ) : history.loading ? (
        <p>読み込み中...</p>
      ) : (
        <p>履歴 {history.data?.length ?? 0} 件</p>
      )}
    </div>
  );
}
