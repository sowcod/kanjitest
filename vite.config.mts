import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
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
