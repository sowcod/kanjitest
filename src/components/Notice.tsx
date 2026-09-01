import '../styles/components.css';

interface NoticeProps {
  variant?: 'error' | 'warning';
  message: string;
  onRetry?: () => void;
}

/** alert() やタブ内の即席エラー表示の置き換え。失敗時は再試行できる形で提示する。 */
export function Notice({ variant = 'error', message, onRetry }: NoticeProps) {
  return (
    <div className={`notice notice-${variant}`} role="alert">
      <span className="notice-message">{message}</span>
      {onRetry && (
        <button type="button" className="btn" onClick={onRetry}>
          再試行
        </button>
      )}
    </div>
  );
}
