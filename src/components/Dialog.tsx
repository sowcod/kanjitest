import { useEffect, useId, useRef } from 'react';
import '../styles/components.css';

interface DialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** alert/confirm の置き換え。削除などの破壊的操作の確認に使う、キーボード操作可能なモーダル。 */
export function Dialog({
  open,
  title,
  message,
  confirmLabel = 'OK',
  cancelLabel = 'キャンセル',
  danger = false,
  onConfirm,
  onCancel,
}: DialogProps) {
  const titleId = useId();
  const messageId = useId();
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div
        className="dialog-box"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="dialog-title" id={titleId}>
          {title}
        </p>
        <p className="dialog-message" id={messageId}>
          {message}
        </p>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            ref={confirmRef}
            className={danger ? 'btn btn-danger' : 'btn btn-primary'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
