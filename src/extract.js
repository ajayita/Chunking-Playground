import { docxXmlToText, odfXmlToText } from './xmltext.js';

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const ACCEPT = '.pdf,.docx,.odt,.txt,.md,.markdown,.text';

const TEXT_EXTS = new Set(['txt', 'md', 'markdown', 'text']);

const extOf = (name) => name.split('.').pop().toLowerCase();

async function readZipEntry(bytes, entryName) {
  const { unzipSync, strFromU8 } = await import('fflate');
  let files;
  try {
    files = unzipSync(bytes, { filter: (f) => f.name === entryName });
  } catch {
    throw new Error("That file couldn't be opened. It may be damaged or password-protected.");
  }
  if (!files[entryName]) throw new Error(`That doesn't look like a valid file (missing ${entryName}).`);
  return strFromU8(files[entryName]);
}

/**
 * Extracts plain text from an uploaded file, entirely in the browser.
 * Parsers (pdf.js, fflate) are imported on demand so they cost nothing until used.
 * Throws an Error with a user-friendly message when the file can't be read.
 */
export async function extractText(file, onProgress = () => {}) {
  const ext = extOf(file.name);

  if (ext === 'doc') {
    throw new Error('Old-style .doc files are not supported. Save it as .docx or PDF in Word and try again.');
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`That file is too large (limit ${MAX_FILE_BYTES / 1024 / 1024} MB).`);
  }

  let text;
  if (TEXT_EXTS.has(ext)) {
    text = await file.text();
  } else if (ext === 'docx') {
    text = docxXmlToText(await readZipEntry(new Uint8Array(await file.arrayBuffer()), 'word/document.xml'));
  } else if (ext === 'odt') {
    text = odfXmlToText(await readZipEntry(new Uint8Array(await file.arrayBuffer()), 'content.xml'));
  } else if (ext === 'pdf') {
    const { pdfToText } = await import('./pdf.js');
    try {
      text = await pdfToText(new Uint8Array(await file.arrayBuffer()), onProgress);
    } catch (err) {
      console.error(err);
      if (err?.name === 'PasswordException') throw new Error('That PDF is password-protected.');
      throw new Error("That PDF couldn't be read. It may be damaged.");
    }
  } else {
    throw new Error('Unsupported file type. Use PDF, DOCX, ODT, TXT or Markdown, or paste the text.');
  }

  if (!text.trim()) {
    throw new Error(
      ext === 'pdf'
        ? 'No text found. This may be a scanned PDF (just images), which this tool cannot read.'
        : 'No text found in that file.'
    );
  }
  return text;
}
