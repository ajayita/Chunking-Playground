# Changelog

Versioning stays at 1.x until a major change.

## 1.0.0

First release.

- Paste a document (sample preloaded), with chunk size and overlap sliders
- Chunk map with alternating colours and overlap highlighting; chunk count and average size
- Top 3 retrieval in two modes side by side: keyword (BM25) and meaning (embeddings via Transformers.js)
- Scores on every result, matched-word highlighting, retrieved chunks outlined
- Guide panel (How to use, Features, About) beside the app on desktop, a drawer on mobile
- Inline `?` help on every control
- Runs entirely client-side; deploys to GitHub Pages via GitHub Actions
