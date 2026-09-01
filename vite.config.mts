import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // GitHub Pagesはプロジェクトページ(/kanjitest/等のサブパス)で配信されるため、
  // 絶対パス('/')ではなく相対パスでアセットを参照する(旧UIのdist/browser直import方式と同様)。
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist/react',
    rollupOptions: {
      input: 'index-react.html',
    },
  },
  test: {
    environment: 'jsdom',
  },
});
