/**
 * kuromojiはUMDビルドのため、Viteでバンドルせず旧UIと同じグローバル読み込み方式
 * （window.kuromoji）を再利用する。読み込みタイミングだけ、ふりがな機能の初回利用時まで遅延する。
 */
let loadPromise: Promise<void> | null = null;

export function loadKuromoji(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    if ((window as unknown as { kuromoji?: unknown }).kuromoji) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = `${import.meta.env.BASE_URL}kuromoji.js`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('kuromoji script failed to load'));
    document.head.appendChild(script);
  });
  return loadPromise;
}

export function kuromojiDicPath(): string {
  return `${import.meta.env.BASE_URL}kuromoji-dict/`;
}
