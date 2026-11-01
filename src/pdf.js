import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** Extracts text from a PDF. onProgress(page, total) is called as each page is read. */
export async function pdfToText(bytes, onProgress = () => {}) {
  const task = pdfjs.getDocument({ data: bytes });
  const pdf = await task.promise;
  const pages = [];
  try {
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      let text = '';
      for (const item of content.items) {
        if (typeof item.str !== 'string') continue;
        text += item.str + (item.hasEOL ? '\n' : '');
      }
      pages.push(text.trim());
      onProgress(n, pdf.numPages);
    }
  } finally {
    await task.destroy();
  }
  return pages.filter(Boolean).join('\n\n');
}
