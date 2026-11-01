# Changelog

Versioning stays at 1.x until a major change.

## 1.1.1

- Restyled on the Ninth design system: IBM Plex Sans and Mono for readability, Ninth's header, panels, fields, tabs and states, a status badge, and the standard footer signature
- Removed the logo banner from the top of the page; the maker's signature now appears only in the footer
- Light, dark and auto themes via Ninth's theme toggle
- Clearer empty, loading and error states for both search modes

## 1.1.0

- Upload PDF, DOCX, ODT, TXT or Markdown files, or drop them on the text box. Text is extracted in the browser; legacy `.doc` is rejected with a hint to save as .docx
- "Reset to sample" button; sample questions only show while the sample document is loaded
- New visual system (Paper and Night themes, self-hosted fonts) and attribution to S. Teniola Ajayi
- Parsers load on demand: nothing extra downloads until a file is chosen (PDF support is about 1.7 MB raw)

## 1.0.0

First release.

- Paste a document (sample preloaded), with chunk size and overlap sliders
- Chunk map with alternating colours and overlap highlighting; chunk count and average size
- Top 3 retrieval in two modes side by side: keyword (BM25) and meaning (embeddings via Transformers.js)
- Scores on every result, matched-word highlighting, retrieved chunks outlined
- Guide panel (How to use, Features, About) beside the app on desktop, a drawer on mobile
- Inline `?` help on every control
- Runs entirely client-side; deploys to GitHub Pages via GitHub Actions
