import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vite';

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // GitHub Pages serves the app at https://akritkbehera.github.io/french-daily/
  base: '/french-daily/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'French Daily — Learn French every day',
        short_name: 'French Daily',
        description:
          'Daily French vocabulary, conjugation and sentence practice with spaced repetition. Works offline.',
        id: '/french-daily/',
        start_url: '/french-daily/',
        scope: '/french-daily/',
        display: 'standalone',
        orientation: 'portrait-primary',
        background_color: '#f7f7f8',
        theme_color: '#4f46e5',
        categories: ['education', 'productivity'],
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        ],
        shortcuts: [
          { name: 'Daily practice', short_name: 'Practice', url: '/french-daily/?view=practice' },
          { name: 'Review due cards', short_name: 'Review', url: '/french-daily/?view=review' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@french-daily/learning-core': path.resolve(dir, '../../packages/learning-core/src/index.ts'),
      '@french-daily/french-data': path.resolve(dir, '../../packages/french-data/src/index.ts'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2022',
    chunkSizeWarningLimit: 900,
  },
  server: { port: 5173 },
  preview: { port: 4173, strictPort: true },
});
