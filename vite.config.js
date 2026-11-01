import { defineConfig } from 'vite';

// For GitHub Pages, set base to '/<repo-name>/'. Override with VITE_BASE if the repo name differs.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/chunking_playground/',
  // The ONNX runtime used by Transformers.js is large by nature; it loads lazily on first search.
  build: { chunkSizeWarningLimit: 1000 },
});
