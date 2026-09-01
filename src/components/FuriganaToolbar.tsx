import { useEffect, useState, type ReactElement, type RefObject } from 'react';
import { buildBracketBox, buildReadBox, buildRuby, buildWriteBox, type FuriganaResult } from '../furigana';
import { useFurigana } from '../hooks/useFurigana';
import { isMac } from '../lib/platform';

type BuildFn = (text: string) => Promise<FuriganaResult>;

function RubyIcon() {
  return (
    <svg className="ficon" viewBox="0 0 20 20" aria-hidden="true">
      <text x="7" y="16" fontSize="12" fontWeight="600" textAnchor="middle" fill="currentColor">
        字
      </text>
      <text x="16" y="14" fontSize="6" textAnchor="middle" fill="currentColor">
        あ
      </text>
    </svg>
  );
}

function ReadIcon() {
  return (
    <svg className="ficon" viewBox="0 0 20 20" aria-hidden="true">
      <text x="5" y="16" fontSize="12" fontWeight="600" textAnchor="middle" fill="currentColor">
        字
      </text>
      <path
        d="M12 5 L12 7.5 M12 5 L17 5 M17 5 L17 7.5 M12 15 L12 12.5 M12 15 L17 15 M17 15 L17 12.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function WriteIcon() {
  return (
    <svg className="ficon" viewBox="0 0 20 20" aria-hidden="true">
      <rect x="2" y="5" width="11" height="11" rx="1" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M7.5 5 L7.5 16 M2 10.5 L13 10.5"
        stroke="currentColor"
        strokeWidth="0.6"
        strokeDasharray="1.2,1.2"
        opacity="0.55"
      />
      <text x="16" y="14" fontSize="6" textAnchor="middle" fill="currentColor">
        あ
      </text>
    </svg>
  );
}

function BracketIcon() {
  return (
    <svg className="ficon" viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M3 4 L3 7.5 M3 4 L9 4 M9 4 L9 7.5 M3 16 L3 12.5 M3 16 L9 16 M9 16 L9 12.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <text x="15" y="8" fontSize="6" textAnchor="middle" fill="currentColor">
        か
      </text>
      <text x="15" y="15" fontSize="6" textAnchor="middle" fill="currentColor">
        く
      </text>
    </svg>
  );
}

const BUTTONS: { id: string; build: BuildFn; label: string; title: string; shortcutKey: string; icon: ReactElement }[] = [
  { id: 'ruby', build: buildRuby, label: 'ふりがな', title: '選択範囲の漢字にふりがなを振る', shortcutKey: 'U', icon: <RubyIcon /> },
  {
    id: 'read',
    build: buildReadBox,
    label: '読みを問題に',
    title: '漢字はそのまま表示し、読みを書く空欄にする',
    shortcutKey: 'I',
    icon: <ReadIcon />,
  },
  {
    id: 'write',
    build: buildWriteBox,
    label: '漢字を問題に',
    title: '漢字を空欄にし、読みを添えて漢字を書かせる',
    shortcutKey: 'O',
    icon: <WriteIcon />,
  },
  {
    id: 'bracket',
    build: buildBracketBox,
    label: '漢字+送り仮名',
    title: '送り仮名を含む語をまとめて空欄にし、読みを添えて書かせる',
    shortcutKey: 'P',
    icon: <BracketIcon />,
  },
];

interface FuriganaToolbarProps {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  /** execCommand('insertText')が使えなかった場合のフォールバック(直接 .value を書き換えた後の通知)専用 */
  onTextChange: (text: string) => void;
  onError: (message: string) => void;
}

/** ふりがな入力補助ツールバー(kuromoji + 教育漢字読みデータでオフライン変換)。旧UIの該当ロジック相当。 */
export function FuriganaToolbar({ textareaRef, onTextChange, onError }: FuriganaToolbarProps) {
  const { ready, error } = useFurigana();
  const [hasSelection, setHasSelection] = useState(false);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const update = () => setHasSelection(el.selectionStart !== el.selectionEnd);
    const events = ['select', 'mouseup', 'keyup', 'input'] as const;
    events.forEach((evt) => el.addEventListener(evt, update));
    update();
    return () => events.forEach((evt) => el.removeEventListener(evt, update));
  }, [textareaRef]);

  async function applyFurigana(buildFn: BuildFn) {
    const el = textareaRef.current;
    if (!ready || !el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    if (start === end) return;
    const selected = el.value.slice(start, end);
    let result: FuriganaResult;
    try {
      result = await buildFn(selected);
    } catch (err) {
      onError(String(err));
      return;
    }
    el.focus();
    el.setSelectionRange(start, end);
    // execCommand('insertText')でネイティブのアンドゥ履歴に載せる。
    // el.value を直接書き換えるとブラウザの元に戻す/やり直すが効かなくなるため。
    const inserted = document.execCommand('insertText', false, result.replacement);
    if (!inserted) {
      const before = el.value.slice(0, start);
      const after = el.value.slice(end);
      el.value = before + result.replacement + after;
      onTextChange(el.value);
    }
    const caret = start + (result.caretOffset ?? result.replacement.length);
    el.setSelectionRange(caret, caret);
    setHasSelection(el.selectionStart !== el.selectionEnd);
  }

  useEffect(() => {
    const el = textareaRef.current;
    if (!el || !ready) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey || !e.shiftKey) return;
      if (e.code === 'KeyU') {
        e.preventDefault();
        void applyFurigana(buildRuby);
      } else if (e.code === 'KeyI') {
        e.preventDefault();
        void applyFurigana(buildReadBox);
      } else if (e.code === 'KeyO') {
        e.preventDefault();
        void applyFurigana(buildWriteBox);
      } else if (e.code === 'KeyP') {
        e.preventDefault();
        void applyFurigana(buildBracketBox);
      }
    };
    el.addEventListener('keydown', onKeyDown);
    return () => el.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textareaRef, ready, onError, onTextChange]);

  return (
    <div className="q-furigana-toolbar">
      {BUTTONS.map((b) => {
        const hint = isMac ? `⌃⇧${b.shortcutKey}` : `Ctrl+Shift+${b.shortcutKey}`;
        return (
          <button
            key={b.id}
            type="button"
            className="btn"
            disabled={!ready || !hasSelection}
            title={b.title}
            onClick={() => void applyFurigana(b.build)}
          >
            {b.icon}
            <span className="ficon-label">{`${b.label} (${hint})`}</span>
          </button>
        );
      })}
      <span className="q-furigana-status">{!ready ? (error ? `読み込み失敗: ${error}` : '読み込み中…') : ''}</span>
    </div>
  );
}
