import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const { version } = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8'),
) as { version: string };

export default defineConfig({
  plugins: [react()],
  // The build the player is looking at, on the title screen. Read from the workspace root
  // rather than the client's own package so one release number covers the whole repo, and
  // baked in at build time because the login screen renders before any request is made.
  define: { __MISTVALE_VERSION__: JSON.stringify(version) },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        // Design tokens and mixins are available in every module without an import.
        additionalData: `@use "@/styles/_tokens.scss" as *;\n@use "@/styles/_mixins.scss" as *;\n`,
      },
    },
  },
  // In production nginx serves these files and proxies /api to the game server. Both
  // the dev and preview servers mirror that so cookies and same-origin behaviour match.
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:3001', changeOrigin: true },
    },
  },
  preview: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:3001', changeOrigin: true },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        // Pixi is large and only the battle/summon screens need it; splitting it keeps
        // the login screen fast on a cold visit (docs/ARCHITECTURE.md §9).
        manualChunks: {
          pixi: ['pixi.js'],
          react: ['react', 'react-dom'],
        },
      },
    },
  },
});
