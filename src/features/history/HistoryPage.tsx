import { useEffect, useRef, useState } from 'react';
import { Dialog } from '../../components/Dialog';
import { Notice } from '../../components/Notice';
import { useHistory } from '../../hooks/useHistory';
import { renderPageToCanvas } from '../../canvasRenderer';
import { getQuestion, type Question } from '../../questionStore';
import { loadSettings } from '../../settingsStore';
import { deleteHistoryEntry, formatTestLabel, recordTest, type TestHistoryEntry } from '../../testHistoryStore';
import { assignColumns } from '../../testGenerator';
import { Tategaki } from '../../tategaki';
import '../../styles/features.css';

const DPR = 2;
const FONT_NAME = '游教科書体';
const A4_RATIO = 841.89 / 595.28;

type ModalState = { kind: 'none' } | { kind: 'confirmDelete'; date: string };

function measureColumnHeight(text: string): number {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return 0;
  const tategaki = new Tategaki(ctx, { font: `32px "${FONT_NAME}"`, lineHeight: 1.0 });
  return tategaki.measureText(text).height;
}

/** 履歴確認タブ本体。旧UI(index.html)の #tab-history 相当。 */
export function HistoryPage() {
  const history = useHistory();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [modal, setModal] = useState<ModalState>({ kind: 'none' });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [detailWarnings, setDetailWarnings] = useState<string[]>([]);
  const [detailColumns, setDetailColumns] = useState<Question[][] | null>(null);
  const [reprintBusy, setReprintBusy] = useState(false);
  const [reprintError, setReprintError] = useState<string | null>(null);

  const entries = [...(history.data ?? [])].reverse(); // 新しい順
  const selectedEntry = entries.find((e) => e.date === selectedDate) ?? null;

  useEffect(() => {
    if (!selectedEntry) {
      setDetailColumns(null);
      setDetailWarnings([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const found: Question[] = [];
      let missingCount = 0;
      for (const id of selectedEntry.questionIds) {
        const q = await getQuestion(id);
        if (q) found.push(q);
        else missingCount++;
      }
      if (cancelled) return;
      setDetailWarnings(missingCount > 0 ? [`${missingCount}問は削除済みのため表示できません。`] : []);
      setDetailColumns(found.length === 0 ? null : assignColumns(found, measureColumnHeight, loadSettings().slotsPerColumn).columns);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedEntry]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas || !detailColumns) return;

    const redraw = () => {
      const cssWidth = Math.min(560, Math.max(wrapper.clientWidth - 32, 300));
      const cssHeight = cssWidth * A4_RATIO;
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
      const rendered = renderPageToCanvas(detailColumns, true, FONT_NAME, cssWidth * DPR, cssHeight * DPR);
      canvas.width = rendered.width;
      canvas.height = rendered.height;
      canvas.getContext('2d')?.drawImage(rendered, 0, 0);
    };

    redraw();
    const ro = new ResizeObserver(redraw);
    ro.observe(wrapper);
    return () => ro.disconnect();
  }, [detailColumns]);

  function doDelete(date: string) {
    deleteHistoryEntry(date);
    if (selectedDate === date) setSelectedDate(null);
    setModal({ kind: 'none' });
    history.reload();
  }

  async function reprint() {
    if (!detailColumns || reprintBusy) return;
    setReprintBusy(true);
    setReprintError(null);
    try {
      const ids = detailColumns.flat().map((q) => q.id);
      const entry = recordTest(ids);
      const label = formatTestLabel(entry.date);
      const { generateTestPdf, openPdfInNewTab } = await import('../../pdfExport');
      const bytes = await generateTestPdf(detailColumns, FONT_NAME, label);
      openPdfInNewTab(bytes);
      history.reload();
    } catch (e) {
      setReprintError(`PDFの生成に失敗しました: ${String(e)}`);
    } finally {
      setReprintBusy(false);
    }
  }

  return (
    <>
      <div className="h-list-pane">
        <div className="h-list-header">テスト履歴({entries.length}件)</div>
        <ul className="h-list">
          {history.error ? (
            <li className="h-empty">履歴の読み込みに失敗しました: {history.error}</li>
          ) : entries.length === 0 ? (
            <li className="h-empty">まだテストを生成していません。</li>
          ) : (
            entries.map((entry: TestHistoryEntry) => (
              <li
                key={entry.date}
                className={entry.date === selectedDate ? 'selected' : undefined}
                onClick={() => setSelectedDate(entry.date)}
              >
                <span className="h-label">
                  {formatTestLabel(entry.date)}
                  <span className="h-count">{entry.questionIds.length}問</span>
                </span>
                <button
                  type="button"
                  className="btn btn-danger h-delete-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setModal({ kind: 'confirmDelete', date: entry.date });
                  }}
                >
                  削除
                </button>
              </li>
            ))
          )}
        </ul>
      </div>

      <div className="h-preview-pane">
        {selectedEntry && detailColumns ? (
          <div className="h-detail-controls">
            <button type="button" className="btn" disabled={reprintBusy} onClick={() => void reprint()}>
              {reprintBusy ? '生成中…' : 'この回をもう一度印刷する'}
            </button>
          </div>
        ) : null}
        {detailWarnings.length > 0 ? <Notice variant="warning" message={detailWarnings.join('\n')} /> : null}
        {reprintError ? <Notice message={reprintError} /> : null}
        {detailColumns ? (
          <div className="h-preview-wrap" ref={wrapperRef}>
            <canvas className="h-preview" ref={canvasRef} />
          </div>
        ) : (
          <div className="h-empty">
            {selectedEntry
              ? 'この回の問題はすべて削除されているため表示できません。'
              : '左の一覧からテストを選ぶと、解答（赤字）がここに表示されます。'}
          </div>
        )}
      </div>

      <Dialog
        open={modal.kind === 'confirmDelete'}
        title="確認"
        message={modal.kind === 'confirmDelete' ? `${formatTestLabel(modal.date)}の履歴を削除しますか？` : ''}
        danger
        onConfirm={() => {
          if (modal.kind === 'confirmDelete') doDelete(modal.date);
        }}
        onCancel={() => setModal({ kind: 'none' })}
      />
    </>
  );
}
