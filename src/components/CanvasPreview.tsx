import { memo, useEffect, useRef } from 'react';
import { Tategaki } from '../tategaki';

const DPR = 2;
const FONT_NAME = '游教科書体';

interface CanvasPreviewProps {
  text: string;
  onError: (message: string | null) => void;
}

/**
 * 問題プレビュー用の縦書きCanvas。旧UIの drawQuestionPreview() 相当。
 * Canvas はリサイズすると2Dコンテキストの状態がリセットされるため、
 * リサイズ前に測定用の Tategaki で計測し、リサイズ後に描画用の Tategaki を作り直す。
 */
function CanvasPreviewImpl({ text, onError }: CanvasPreviewProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const redraw = () => {
      onError(null);
      const fontSize = 17 * DPR;
      const marginV = 20 * DPR;
      const wrapWidth = wrapper.clientWidth - 24;
      const wrapHeight = wrapper.clientHeight - 24;

      let textWidth = 0;
      let textHeight = 0;
      let measureError: unknown = null;
      if (text) {
        try {
          const measured = new Tategaki(ctx, { font: `${fontSize}px "${FONT_NAME}"`, lineHeight: 1.0 }).measureText(text);
          textWidth = measured.width;
          textHeight = measured.height;
        } catch (e) {
          measureError = e;
        }
      }

      const cssWidth = Math.max(wrapWidth, Math.ceil(textWidth / DPR) + 40, 150);
      const cssHeight = Math.max(wrapHeight, Math.ceil(textHeight / DPR) + Math.ceil((marginV * 2) / DPR), 200);
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
      canvas.width = cssWidth * DPR;
      canvas.height = cssHeight * DPR;

      const tategaki = new Tategaki(ctx, { font: `${fontSize}px "${FONT_NAME}"`, lineHeight: 1.0 });
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (!text) return;

      if (measureError) {
        onError(String(measureError));
        return;
      }

      try {
        const startX = Math.round(canvas.width / 2 + tategaki.measureText(text).width / 2);
        tategaki.fillText(text, startX, marginV);
      } catch (e) {
        onError(String(e));
      }
    };

    redraw();
    const ro = new ResizeObserver(redraw);
    ro.observe(wrapper);
    return () => ro.disconnect();
  }, [text, onError]);

  return (
    <div className="q-preview-wrap" ref={wrapperRef}>
      <canvas className="q-preview" ref={canvasRef} />
    </div>
  );
}

export const CanvasPreview = memo(CanvasPreviewImpl);
