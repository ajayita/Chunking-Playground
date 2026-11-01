/**
 * Plain-text extraction from the XML inside DOCX and ODT files.
 * Regex-based on purpose: no dependencies, and it runs in both the browser and Node (for tests).
 */

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : Number(body.slice(1));
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

const joinParagraphs = (paragraphs) =>
  paragraphs
    .map((p) => p.trim())
    .filter(Boolean)
    .join('\n\n');

/** word/document.xml -> text. Paragraphs (w:p) become blank-line separated blocks. */
export function docxXmlToText(xml) {
  const token = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:(?:br|cr)\s*\/>/g;
  const paragraphs = xml.split('</w:p>').map((chunk) => {
    let out = '';
    for (const m of chunk.matchAll(token)) {
      if (m[1] !== undefined) out += decodeEntities(m[1]);
      else out += m[0].startsWith('<w:tab') ? '\t' : '\n';
    }
    return out;
  });
  return joinParagraphs(paragraphs);
}

/** content.xml (OpenDocument text) -> text. Handles paragraphs, headings, spaces, tabs, line breaks. */
export function odfXmlToText(xml) {
  const block = /<text:(p|h)(?:\s[^>]*)?(?<!\/)>([\s\S]*?)<\/text:\1>/g;
  const paragraphs = [];
  for (const m of xml.matchAll(block)) {
    const inner = m[2]
      .replace(/<text:s(?:\s+text:c="(\d+)")?\s*\/>/g, (_, n) => ' '.repeat(Number(n ?? 1)))
      .replace(/<text:tab\s*\/>/g, '\t')
      .replace(/<text:line-break\s*\/>/g, '\n')
      .replace(/<[^>]+>/g, '');
    paragraphs.push(decodeEntities(inner));
  }
  return joinParagraphs(paragraphs);
}
