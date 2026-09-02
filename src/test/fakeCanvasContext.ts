/**
 * jsdom は `canvas` npm パッケージ(ネイティブ依存)が無いと `getContext('2d')` が
 * null を返し、`toDataURL` も未実装。実際の描画結果(ピクセル)はPlaywrightの
 * スクリーンショット差分で検証済みのため、ここでは構造的な正しさ(呼び出しが
 * 例外を投げないこと・サイズ計算)だけを見るための no-op スタブを用意する。
 */

const STUB_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function makeFakeContext(): CanvasRenderingContext2D {
  const noop = () => {};
  const ctx = {
    save: noop,
    restore: noop,
    translate: noop,
    rotate: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    stroke: noop,
    setLineDash: noop,
    strokeRect: noop,
    fillRect: noop,
    fillText: noop,
    measureText: (text: string) => ({
      width: text.length * 10,
      actualBoundingBoxAscent: 10,
      actualBoundingBoxDescent: 2,
    }),
    fillStyle: '',
    strokeStyle: '',
    font: '',
    lineWidth: 1,
    textAlign: 'left',
    textBaseline: 'alphabetic',
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

/** `HTMLCanvasElement.prototype` を差し替える。戻り値を呼ぶと元に戻せる。 */
export function installFakeCanvasContext(): () => void {
  const proto = HTMLCanvasElement.prototype as unknown as {
    getContext: (...args: unknown[]) => unknown;
    toDataURL: (...args: unknown[]) => string;
  };
  const originalGetContext = proto.getContext;
  const originalToDataURL = proto.toDataURL;

  proto.getContext = () => makeFakeContext();
  proto.toDataURL = () => STUB_PNG_DATA_URL;

  return () => {
    proto.getContext = originalGetContext;
    proto.toDataURL = originalToDataURL;
  };
}
