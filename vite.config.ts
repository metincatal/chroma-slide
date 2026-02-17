import { defineConfig } from 'vite';

export default defineConfig({
  base: '/chroma-slide/',
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
  },
});
