import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chunkText, chunkStats, highlightSegments } from '../src/chunker.js';
import { buildBM25, tokenize } from '../src/bm25.js';
import { cosineSimilarity, rankBySimilarity } from '../src/similarity.js';

test('chunkText splits with overlap and covers the whole text', () => {
  const text = 'abcdefghij'; // 10 chars
  const chunks = chunkText(text, 4, 2);
  assert.deepEqual(
    chunks.map((c) => c.text),
    ['abcd', 'cdef', 'efgh', 'ghij']
  );
  assert.equal(chunks.at(-1).end, text.length);
});

test('chunkText with no overlap yields a short final chunk', () => {
  const chunks = chunkText('abcdefghij', 4, 0);
  assert.deepEqual(
    chunks.map((c) => c.text),
    ['abcd', 'efgh', 'ij']
  );
});

test('chunkText clamps overlap >= size so it terminates', () => {
  const chunks = chunkText('abcdef', 3, 10);
  assert.ok(chunks.length > 0 && chunks.length <= 6);
  assert.equal(chunks.at(-1).end, 6);
});

test('chunkText handles empty text and oversize chunks', () => {
  assert.deepEqual(chunkText('', 5, 1), []);
  assert.equal(chunkText('abc', 100, 0).length, 1);
});

test('chunkStats', () => {
  assert.deepEqual(chunkStats(chunkText('abcdefghij', 4, 0)), { count: 3, avgSize: 3 });
  assert.deepEqual(chunkStats([]), { count: 0, avgSize: 0 });
});

test('highlightSegments marks overlaps with multiple chunk ids', () => {
  const text = 'abcdefghij';
  const segs = highlightSegments(text, chunkText(text, 4, 2));
  assert.equal(segs.map((s) => s.text).join(''), text);
  assert.ok(segs.some((s) => s.chunkIds.length === 2));
  assert.ok(segs.every((s) => s.chunkIds.length >= 1));
});

test('tokenize lowercases and drops stopwords', () => {
  assert.deepEqual(tokenize('The Quick, brown FOX!'), ['quick', 'brown', 'fox']);
});

test('BM25 ranks the chunk containing the query terms first', () => {
  const chunks = [
    { id: 0, text: 'Cats sleep most of the day.' },
    { id: 1, text: 'Embeddings map text to vectors.' },
    { id: 2, text: 'Vectors and embeddings enable semantic search.' },
  ];
  const results = buildBM25(chunks).search('embeddings vectors semantic', 3);
  assert.equal(results[0].chunk.id, 2);
  assert.deepEqual(results[0].matched.sort(), ['embeddings', 'semantic', 'vectors']);
  assert.ok(!results.some((r) => r.chunk.id === 0));
});

test('cosine similarity', () => {
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.equal(cosineSimilarity([0, 0], [1, 1]), 0);
  assert.ok(Math.abs(cosineSimilarity([1, 1], [2, 2]) - 1) < 1e-12);
});

test('rankBySimilarity orders by score and respects topK', () => {
  const chunks = [{ id: 0 }, { id: 1 }, { id: 2 }];
  const ranked = rankBySimilarity([1, 0], chunks, [[0, 1], [1, 0], [1, 1]], 2);
  assert.deepEqual(ranked.map((r) => r.chunk.id), [1, 2]);
});
