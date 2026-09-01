import { useEffect, useId, useRef, useState } from 'react';
import '../styles/components.css';

interface PromptDialogProps {
  open: boolean;
  title: string;
  message?: string;
  label: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

/** prompt() の置き換え。テキスト入力を伴う確認モーダル(データセットの作成/名称変更で使用)。 */
export function PromptDialog({
  open,
  title,
  message,
  label,
  defaultValue = '',
  confirmLabel = 'OK',
  cancelLabel = 'キャンセル',
  onConfirm,
  onCancel,
}: PromptDialogProps) {
  const titleId = useId();
  const messageId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    if (!open) return;
    setValue(defaultValue);
    const el = inputRef.current;
    if (el) {
      el.focus();
      el.select();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const trimmed = value.trim();

  const submit = () => {
    if (!trimmed) return;
    onConfirm(trimmed);
  };

  useEffect(() => {
    if (!open) return;
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
        {message ? (
          <p className="dialog-message" id={messageId}>
            {message}
          </p>
        ) : null}
        <input
          ref={inputRef}
          type="text"
          className="dialog-input"
          aria-label={label}
          value={value}
          placeholder={label}
          onChange={(e) => setValue(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="btn btn-primary" disabled={!trimmed} onClick={submit}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
