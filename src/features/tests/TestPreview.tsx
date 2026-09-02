import { memo, useEffect, useRef } from 'react';
import { renderPageToCanvas } from '../../canvasRenderer';
import type { Question } from '../../questionStore';

const DPR = 2;
const FONT_NAME = '游教科書体';
const A4_RATIO = 841.89 / 595.28;

interface TestPreviewProps {
  columns: Question[][] | null;
}

/** テスト生成タブのA4プレビュー。旧UIの drawTestPreview() 相当。 */
function TestPreviewImpl({ columns }: TestPreviewProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas || !columns) return;

    const redraw = () => {
      const cssWidth = Math.min(560, Math.max(wrapper.clientWidth - 32, 300));
      const cssHeight = cssWidth * A4_RATIO;
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;

      // 画面プレビューは作成者が内容を確認できるよう答えを表示する。印刷用PDFは答えを表示しない。
      const rendered = renderPageToCanvas(columns, true, FONT_NAME, cssWidth * DPR, cssHeight * DPR);
      canvas.width = rendered.width;
      canvas.height = rendered.height;
      canvas.getContext('2d')?.drawImage(rendered, 0, 0);
    };

    redraw();
    const ro = new ResizeObserver(redraw);
    ro.observe(wrapper);
    return () => ro.disconnect();
  }, [columns]);

  return (
    <div className="t-preview-wrap" ref={wrapperRef}>
      {columns ? (
        <canvas className="t-preview" ref={canvasRef} />
      ) : (
        <div className="t-empty">「ランダム生成」を押すか、左の一覧から問題を選ぶとここにプレビューが表示されます。</div>
      )}
    </div>
  );
}

export const TestPreview = memo(TestPreviewImpl);
