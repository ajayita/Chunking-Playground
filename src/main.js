import { chunkText, chunkStats, highlightSegments } from './chunker.js';
import { buildBM25, splitByMatches } from './bm25.js';
import { rankBySimilarity } from './similarity.js';
import { embed, loadModel } from './embeddings.js';
import { SAMPLE_DOCUMENT, SAMPLE_QUESTIONS } from './sample.js';
import { extractText, ACCEPT } from './extract.js';

const TOP_K = 3;
const $ = (id) => document.getElementById(id);

const els = {
  doc: $('doc'),
  file: $('file'),
  fileStatus: $('file-status'),
  size: $('size'),
  sizeOut: $('size-out'),
  overlap: $('overlap'),
  overlapOut: $('overlap-out'),
  statCount: $('stat-count'),
  statAvg: $('stat-avg'),
  docView: $('doc-view'),
  form: $('ask-form'),
  question: $('question'),
  chips: $('chips'),
  chipsHint: $('chips-hint'),
  kw: $('kw-results'),
  em: $('em-results'),
  modelStatus: $('model-status'),
};

const state = {
  chunks: [],
  bm25: null,
  question: '',
  picked: { kw: new Set(), em: new Set() },
  modelReady: false,
  searchToken: 0,
};

const vectorCache = new Map(); // chunk text -> embedding

function h(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

/* ---------- chunking + document view ---------- */

function applyChunking() {
  const size = Number(els.size.value);
  // Overlap can never reach the chunk size; keep the slider range honest.
  const maxOverlap = Math.max(0, Math.floor((size * 0.9) / 5) * 5);
  els.overlap.max = String(maxOverlap);
  if (Number(els.overlap.value) > maxOverlap) els.overlap.value = String(maxOverlap);
  const overlap = Number(els.overlap.value);

  els.sizeOut.textContent = `${size} characters`;
  els.overlapOut.textContent = `${overlap} characters`;

  // Sample questions are written for the sample document; hide them once the text is changed.
  const isSample = els.doc.value === SAMPLE_DOCUMENT;
  els.chips.hidden = !isSample;
  els.chipsHint.hidden = isSample;

  state.chunks = chunkText(els.doc.value, size, overlap);
  state.bm25 = buildBM25(state.chunks);

  const { count, avgSize } = chunkStats(state.chunks);
  els.statCount.textContent = count;
  els.statAvg.textContent = avgSize;

  renderDocView();
  if (state.question) runSearch();
}

function renderDocView() {
  const picked = new Set([...state.picked.kw, ...state.picked.em]);
  const segments = highlightSegments(els.doc.value, state.chunks);
  const frag = document.createDocumentFragment();
  for (const seg of segments) {
    const ids = seg.chunkIds;
    const cls = ids.length > 1 ? 'ov' : ids[0] % 2 ? 'b' : 'a';
    const span = h('span', { className: cls, textContent: seg.text });
    span.title = ids.length > 1 ? `Overlap of chunks ${ids.join(' and ')}` : `Chunk ${ids[0]}`;
    if (ids.some((id) => picked.has(id))) span.classList.add('picked');
    frag.append(span);
  }
  els.docView.replaceChildren(frag);
}

/* ---------- result rendering ---------- */

function resultCard(rank, r, maxScore, { highlight }) {
  const c = r.chunk;
  const body = h('p', { className: 'result-text' });
  if (highlight) {
    for (const part of splitByMatches(c.text, r.matched)) {
      body.append(part.hit ? h('mark', { textContent: part.text }) : part.text);
    }
  } else {
    body.textContent = c.text;
  }
  const pct = maxScore > 0 ? Math.max(0, Math.min(100, (r.score / maxScore) * 100)) : 0;
  const head = h(
    'div',
    { className: 'result-head n-data' },
    h('span', {}, h('strong', { textContent: `#${rank}` }), ` · chunk ${c.id} · characters ${c.start}–${c.end}`),
    h('span', { textContent: `score ${r.score.toFixed(3)}` })
  );
  const bar = h('div', { className: 'score-bar' }, h('div', { style: `width:${pct}%` }));
  const card = h('div', { className: 'result' }, head, bar, body);
  if (r.matched) {
    card.append(h('p', { className: 'result-matched', textContent: `Matched words: ${r.matched.join(', ')}` }));
  }
  return card;
}

/** Ninth state message: kind is 'empty' | 'loading' | 'error'. */
function showState(container, kind, title, text, action) {
  const titleEl = h('p', { className: 'n-state-title' });
  if (kind === 'loading') titleEl.append(h('span', { className: 'n-spinner' }));
  titleEl.append(title);
  const node = h('div', { className: 'n-state' }, titleEl);
  node.dataset.kind = kind;
  if (kind === 'loading') node.setAttribute('role', 'status');
  if (kind === 'error') node.setAttribute('role', 'alert');
  if (text) node.append(h('p', { textContent: text }));
  if (action) {
    node.append(h('button', { type: 'button', className: 'n-btn n-btn--secondary n-btn--sm', textContent: action.label, onclick: action.onClick }));
  }
  container.replaceChildren(node);
}

/* ---------- search ---------- */

async function runSearch() {
  const token = ++state.searchToken;
  const q = state.question;
  const chunks = state.chunks;
  state.picked = { kw: new Set(), em: new Set() };

  if (!chunks.length) {
    showState(els.kw, 'empty', 'No text yet', 'Paste a document or upload a file, then search.');
    showState(els.em, 'empty', 'No text yet', 'Paste a document or upload a file, then search.');
    return renderDocView();
  }

  // Keyword search is synchronous.
  const kw = state.bm25.search(q, TOP_K);
  if (kw.length) {
    const max = kw[0].score;
    els.kw.replaceChildren(...kw.map((r, i) => resultCard(i + 1, r, max, { highlight: true })));
  } else {
    showState(els.kw, 'empty', 'No exact matches', 'No chunk shares a word with your question. Try different words, or compare with meaning search.');
  }
  state.picked.kw = new Set(kw.map((r) => r.chunk.id));
  renderDocView();

  // Embedding search needs the model and vectors for every chunk.
  showState(els.em, 'loading', state.modelReady ? 'Embedding chunks…' : 'Waiting for the model to load…');
  try {
    const missing = [...new Set(chunks.map((c) => c.text).filter((t) => !vectorCache.has(t)))];
    if (missing.length) {
      const vecs = await embed(missing, (done, total) => {
        if (token === state.searchToken) showState(els.em, 'loading', `Embedding chunks… ${done} of ${total}`);
      });
      missing.forEach((t, i) => vectorCache.set(t, vecs[i]));
    }
    const [qVec] = await embed([q]);
    if (token !== state.searchToken) return; // a newer search superseded this one

    const ranked = rankBySimilarity(qVec, chunks, chunks.map((c) => vectorCache.get(c.text)), TOP_K);
    // Cosine similarity of normalized vectors: 1 = same meaning, ~0 = unrelated.
    els.em.replaceChildren(...ranked.map((r, i) => resultCard(i + 1, r, 1, { highlight: false })));
    state.picked.em = new Set(ranked.map((r) => r.chunk.id));
    renderDocView();
  } catch (err) {
    if (token !== state.searchToken) return;
    console.error(err);
    showState(els.em, 'error', 'Meaning search failed', "The embedding model couldn't run. Reload the page and try again; keyword search still works.");
  }
}

function ask(q) {
  state.question = q.trim();
  els.question.value = state.question;
  if (!state.question) return;
  runSearch();
}

/* ---------- model loading indicator ---------- */

function startModelLoad() {
  const label = h('span', { textContent: 'Downloading the embedding model (about 23 MB, first visit only)…' });
  const fill = h('div');
  els.modelStatus.replaceChildren(label, h('div', { className: 'progress' }, fill));
  loadModel((pct) => {
    fill.style.width = `${pct.toFixed(0)}%`;
    label.textContent = `Downloading the embedding model… ${pct.toFixed(0)}%`;
  })
    .then(() => {
      state.modelReady = true;
      els.modelStatus.textContent = 'Embedding model ready (cached in your browser).';
    })
    .catch((err) => {
      console.error(err);
      showState(
        els.modelStatus,
        'error',
        "Meaning search isn't available",
        `The embedding model couldn't be loaded (${err?.message ?? err}). Check your connection, and that nothing is blocking huggingface.co, then try again. Keyword search still works.`,
        { label: 'Try again', onClick: startModelLoad }
      );
    });
}

/* ---------- file upload (PDF, DOCX, ODT, TXT, Markdown) ---------- */

const LARGE_TEXT = 100_000;

function setFileStatus(text, isError = false) {
  els.fileStatus.hidden = !text;
  els.fileStatus.textContent = text;
  els.fileStatus.className = isError ? 'n-error' : 'n-hint';
  els.fileStatus.setAttribute('role', isError ? 'alert' : 'status');
}

async function handleFile(file) {
  setFileStatus(`Reading ${file.name}…`);
  try {
    const text = await extractText(file, (page, total) => {
      setFileStatus(`Reading ${file.name}: page ${page} of ${total}…`);
    });
    els.doc.value = text;
    applyChunking();
    const size = text.length.toLocaleString();
    setFileStatus(
      text.length > LARGE_TEXT
        ? `Loaded ${file.name} (${size} characters). That is a large document, so meaning search may take a while.`
        : `Loaded ${file.name} (${size} characters).`
    );
  } catch (err) {
    console.error(err);
    setFileStatus(err.message ?? String(err), true);
  }
}

function setupUpload() {
  els.file.accept = ACCEPT;
  $('upload-btn').addEventListener('click', () => els.file.click());
  els.file.addEventListener('change', () => {
    const [file] = els.file.files;
    els.file.value = ''; // allow picking the same file again
    if (file) handleFile(file);
  });
  $('reset-btn').addEventListener('click', () => {
    els.doc.value = SAMPLE_DOCUMENT;
    setFileStatus('');
    applyChunking();
  });

  // Drag a file onto the text box.
  els.doc.addEventListener('dragover', (e) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    els.doc.classList.add('dragging');
  });
  els.doc.addEventListener('dragleave', () => els.doc.classList.remove('dragging'));
  els.doc.addEventListener('drop', (e) => {
    els.doc.classList.remove('dragging');
    const [file] = e.dataTransfer?.files ?? [];
    if (!file) return;
    e.preventDefault();
    handleFile(file);
  });
}

/* ---------- help buttons ---------- */

function setupHelp() {
  for (const btn of document.querySelectorAll('button.explain')) {
    btn.addEventListener('click', () => {
      const hint = document.getElementById(btn.getAttribute('aria-controls'));
      const open = hint.hidden;
      hint.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
    });
  }
}

/* ---------- guide panel: mobile drawer (tabs and theme toggle come from Ninth) ---------- */

function setupGuide() {
  const guide = $('guide');
  const toggle = $('guide-toggle');
  const backdrop = $('backdrop');
  const setOpen = (open) => {
    guide.classList.toggle('open', open);
    backdrop.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    (open ? $('guide-close') : toggle).focus();
  };
  toggle.addEventListener('click', () => setOpen(true));
  $('guide-close').addEventListener('click', () => setOpen(false));
  backdrop.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && guide.classList.contains('open')) setOpen(false);
  });

  for (const v of document.querySelectorAll('.version')) v.textContent = __APP_VERSION__;
}

/* ---------- wiring ---------- */

els.doc.value = SAMPLE_DOCUMENT;
els.doc.addEventListener('input', applyChunking);
els.size.addEventListener('input', applyChunking);
els.overlap.addEventListener('input', applyChunking);
els.form.addEventListener('submit', (e) => {
  e.preventDefault();
  ask(els.question.value);
});
for (const q of SAMPLE_QUESTIONS) {
  els.chips.append(h('button', { type: 'button', className: 'n-btn n-btn--secondary n-btn--sm', textContent: q, onclick: () => ask(q) }));
}

showState(els.kw, 'empty', 'No results yet', 'Ask a question to see the top 3 chunks.');
showState(els.em, 'empty', 'No results yet', 'Ask a question to see the top 3 chunks.');
setupHelp();
setupGuide();
setupUpload();
applyChunking();
startModelLoad();
