import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@french-daily/learning-core': path.resolve(root, 'packages/learning-core/src/index.ts'),
      '@french-daily/french-data': path.resolve(root, 'packages/french-data/src/index.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [path.resolve(root, 'vitest.setup.ts')],
    include: ['packages/**/*.test.ts', 'apps/web/src/**/*.test.{ts,tsx}'],
    css: false,
  },
});
