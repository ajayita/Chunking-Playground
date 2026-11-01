const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
const BATCH = 16;

let extractorPromise = null;

/**
 * Lazily loads the embedding model (downloaded once, then cached by the browser).
 * onProgress receives a 0-100 number aggregated across all model files.
 */
export function loadModel(onProgress = () => {}) {
  if (extractorPromise) return extractorPromise;

  const files = new Map(); // file -> { loaded, total }
  extractorPromise = import('@huggingface/transformers')
    .then(({ pipeline, env }) => {
      // Always fetch from the Hugging Face CDN. Without this, a dev server's index.html fallback can be
      // mistaken for a local model file and fail to parse.
      env.allowLocalModels = false;
      env.allowRemoteModels = true;
      return pipeline('feature-extraction', MODEL_ID, {
        dtype: 'q8',
        progress_callback: (p) => {
          if (p.status !== 'progress' || !p.total) return;
          files.set(p.file, { loaded: p.loaded, total: p.total });
          let loaded = 0;
          let total = 0;
          for (const f of files.values()) {
            loaded += f.loaded;
            total += f.total;
          }
          onProgress(total ? (loaded / total) * 100 : 0);
        },
      });
    })
    .catch((err) => {
      extractorPromise = null; // allow retry
      throw err;
    });
  return extractorPromise;
}

/** Embeds texts into normalized vectors. onBatch(done, total) reports progress. */
export async function embed(texts, onBatch = () => {}) {
  const extractor = await loadModel();
  const vectors = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const out = await extractor(texts.slice(i, i + BATCH), { pooling: 'mean', normalize: true });
    vectors.push(...out.tolist());
    onBatch(Math.min(i + BATCH, texts.length), texts.length);
  }
  return vectors;
}
