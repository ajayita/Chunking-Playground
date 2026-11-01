import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// For GitHub Pages, set base to '/<repo-name>/'. Override with VITE_BASE if the repo name differs.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/chunking_playground/',
  define: { __APP_VERSION__: JSON.stringify(version) },
  // The ONNX runtime used by Transformers.js is large by nature; it loads lazily on first search.
  build: { chunkSizeWarningLimit: 1000 },
});
