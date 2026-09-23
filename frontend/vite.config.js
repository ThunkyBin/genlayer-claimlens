import { defineConfig } from 'vite';

export default defineConfig({
  base: '/genlayer-claimlens/',
  build: {
    outDir: '../docs',
    emptyOutDir: true,
  },
});
