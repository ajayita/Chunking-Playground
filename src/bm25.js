const STOPWORDS = new Set(
  'a an and are as at be but by for if in into is it no not of on or such that the their then there these they this to was will with'.split(
    ' '
  )
);

export function tokenize(text) {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => !STOPWORDS.has(t));
}

/** Splits text into [{ text, hit }] parts, where hit marks words found in `matched`. */
export function splitByMatches(text, matched) {
  const set = new Set(matched);
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(/[a-z0-9]+/gi)) {
    if (!set.has(m[0].toLowerCase())) continue;
    if (m.index > last) parts.push({ text: text.slice(last, m.index), hit: false });
    parts.push({ text: m[0], hit: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), hit: false });
  return parts;
}

/**
 * Okapi BM25. Builds an index over chunk texts, then scores a query against each chunk.
 * score(q, d) = sum over query terms t of IDF(t) * tf*(k1+1) / (tf + k1*(1 - b + b*|d|/avgdl))
 */
export function buildBM25(chunks, { k1 = 1.5, b = 0.75 } = {}) {
  const docs = chunks.map((c) => tokenize(c.text));
  const N = docs.length;
  const avgdl = N ? docs.reduce((s, d) => s + d.length, 0) / N : 0;

  const df = new Map();
  const tfs = docs.map((tokens) => {
    const tf = new Map();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const t of tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
    return tf;
  });

  const idf = (t) => {
    const n = df.get(t) ?? 0;
    return Math.log(1 + (N - n + 0.5) / (n + 0.5));
  };

  return {
    search(query, topK = 3) {
      const terms = [...new Set(tokenize(query))];
      const scored = chunks.map((chunk, i) => {
        const len = docs[i].length;
        let score = 0;
        const matched = [];
        for (const t of terms) {
          const tf = tfs[i].get(t) ?? 0;
          if (!tf) continue;
          matched.push(t);
          score += (idf(t) * (tf * (k1 + 1))) / (tf + k1 * (1 - b + (b * len) / (avgdl || 1)));
        }
        return { chunk, score, matched };
      });
      return scored
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
    },
  };
}
