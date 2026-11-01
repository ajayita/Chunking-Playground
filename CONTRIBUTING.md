# Contributing

Thanks for helping out. This is an educational project, so clarity beats cleverness.

## Setup

```bash
pnpm install
pnpm dev
```

## Guidelines

- Keep it framework-free: vanilla JS, HTML, CSS.
- The chunker, BM25 and cosine similarity are hand-written on purpose. Don't swap them for libraries.
- Everything must run client-side. No servers, no API keys.
- Explanations shown to users should be plain English.
- Check the layout on a phone-width viewport before opening a PR.

## Pull requests

1. Branch from `main`.
2. Keep changes focused; describe what and why.
3. Make sure `pnpm build` passes.

## Reporting issues

Open an issue with steps to reproduce, the document/settings used, and your browser.
