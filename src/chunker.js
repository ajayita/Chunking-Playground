/**
 * Fixed-size chunker with overlap, measured in characters.
 * Returns [{ id, start, end, text }] where start/end index into the original text.
 * Consecutive chunks share `overlap` characters.
 */
export function chunkText(text, chunkSize, overlap) {
  const size = Math.max(1, Math.floor(chunkSize));
  // Overlap must be smaller than size, otherwise the window never advances.
  const ov = Math.min(Math.max(0, Math.floor(overlap)), size - 1);
  const step = size - ov;

  const chunks = [];
  for (let start = 0; start < text.length; start += step) {
    const end = Math.min(start + size, text.length);
    chunks.push({ id: chunks.length, start, end, text: text.slice(start, end) });
    if (end === text.length) break;
  }
  return chunks;
}

export function chunkStats(chunks) {
  const count = chunks.length;
  const total = chunks.reduce((sum, c) => sum + c.text.length, 0);
  return { count, avgSize: count ? Math.round(total / count) : 0 };
}

/**
 * Splits the document into contiguous segments for highlighting.
 * Each segment records which chunks cover it: one chunk -> alternating colour
 * (by chunk id parity), two or more -> overlap colour.
 */
export function highlightSegments(text, chunks) {
  const cuts = new Set([0, text.length]);
  for (const c of chunks) {
    cuts.add(c.start);
    cuts.add(c.end);
  }
  const points = [...cuts].sort((a, b) => a - b);

  const segments = [];
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];
    const covering = chunks.filter((c) => c.start < end && c.end > start).map((c) => c.id);
    segments.push({ start, end, text: text.slice(start, end), chunkIds: covering });
  }
  return segments;
}
