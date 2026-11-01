/** Cosine similarity of two equal-length vectors. */
export function cosineSimilarity(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** Rank chunk embeddings against a query embedding. */
export function rankBySimilarity(queryVec, chunks, chunkVecs, topK = 3) {
  return chunks
    .map((chunk, i) => ({ chunk, score: cosineSimilarity(queryVec, chunkVecs[i]) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
