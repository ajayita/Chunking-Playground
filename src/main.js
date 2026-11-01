import { chunkText, chunkStats, highlightSegments } from './chunker.js';
import { buildBM25, splitByMatches } from './bm25.js';
import { rankBySimilarity } from './similarity.js';
import { embed, loadModel } from './embeddings.js';
import { SAMPLE_DOCUMENT, SAMPLE_QUESTIONS } from './sample.js';

const TOP_K = 3;
const $ = (id) => document.getElementById(id);

const els = {
  doc: $('doc'),
  size: $('size'),
  sizeOut: $('size-out'),
  overlap: $('overlap'),
  overlapOut: $('overlap-out'),
  stats: $('stats'),
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

  els.sizeOut.textContent = size;
  els.overlapOut.textContent = overlap;

  // Sample questions are written for the sample document; hide them once the text is changed.
  const isSample = els.doc.value === SAMPLE_DOCUMENT;
  els.chips.hidden = !isSample;
  els.chipsHint.hidden = isSample;

  state.chunks = chunkText(els.doc.value, size, overlap);
  state.bm25 = buildBM25(state.chunks);

  const { count, avgSize } = chunkStats(state.chunks);
  els.stats.textContent = count
    ? `${count} chunk${count === 1 ? '' : 's'}, average ${avgSize} characters`
    : 'No text yet. Paste a document above.';

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
    { className: 'result-head' },
    h('span', {}, h('strong', { textContent: `#${rank}` }), ` · chunk ${c.id} · chars ${c.start}–${c.end}`),
    h('span', { textContent: `score ${r.score.toFixed(3)}` })
  );
  const bar = h('div', { className: 'score-bar' }, h('div', { style: `width:${pct}%` }));
  const card = h('div', { className: 'result' }, head, bar, body);
  if (r.matched) {
    card.append(h('p', { className: 'note', textContent: `Matched words: ${r.matched.join(', ')}` }));
  }
  return card;
}

function showEmpty(container, text) {
  container.replaceChildren(h('p', { className: 'empty', textContent: text }));
}

/* ---------- search ---------- */

async function runSearch() {
  const token = ++state.searchToken;
  const q = state.question;
  const chunks = state.chunks;
  state.picked = { kw: new Set(), em: new Set() };

  if (!chunks.length) {
    showEmpty(els.kw, 'Add some text first.');
    showEmpty(els.em, 'Add some text first.');
    return renderDocView();
  }

  // Keyword search is synchronous.
  const kw = state.bm25.search(q, TOP_K);
  if (kw.length) {
    const max = kw[0].score;
    els.kw.replaceChildren(...kw.map((r, i) => resultCard(i + 1, r, max, { highlight: true })));
  } else {
    showEmpty(els.kw, 'No chunk shares an exact word with your question, so keyword search returns nothing.');
  }
  state.picked.kw = new Set(kw.map((r) => r.chunk.id));
  renderDocView();

  // Embedding search needs the model and vectors for every chunk.
  showEmpty(els.em, state.modelReady ? 'Embedding chunks…' : 'Waiting for the model to load…');
  try {
    const missing = [...new Set(chunks.map((c) => c.text).filter((t) => !vectorCache.has(t)))];
    if (missing.length) {
      const vecs = await embed(missing, (done, total) => {
        if (token === state.searchToken) showEmpty(els.em, `Embedding chunks… ${done}/${total}`);
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
    showEmpty(els.em, `Could not run the embedding model: ${err.message ?? err}`);
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
      els.modelStatus.textContent = `Embedding model failed to load: ${err.message ?? err}. Keyword search still works.`;
    });
}

/* ---------- help buttons ---------- */

function setupHelp() {
  for (const btn of document.querySelectorAll('button.help')) {
    btn.addEventListener('click', () => {
      const hint = document.getElementById(btn.getAttribute('aria-controls'));
      const open = hint.hidden;
      hint.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
    });
  }
}

/* ---------- theme toggle (Paper / Night) ---------- */

function setupTheme() {
  const btn = $('theme-toggle');
  const root = document.documentElement;
  const label = () => {
    const night = root.getAttribute('data-theme') === 'night';
    btn.textContent = night ? 'Theme: Night' : 'Theme: Paper';
  };
  btn.addEventListener('click', () => {
    const next = root.getAttribute('data-theme') === 'night' ? 'paper' : 'night';
    root.setAttribute('data-theme', next);
    try {
      localStorage.setItem('theme', next);
    } catch {
      /* storage unavailable: the choice just won't persist */
    }
    label();
  });
  label();
}

/* ---------- guide panel: tabs + mobile drawer ---------- */

function setupGuide() {
  const tabs = [...document.querySelectorAll('.tabs [role="tab"]')];
  const select = (tab) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    }
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(t));
    t.addEventListener('keydown', (e) => {
      const next = { ArrowRight: i + 1, ArrowLeft: i - 1 }[e.key];
      if (next === undefined) return;
      const target = tabs[(next + tabs.length) % tabs.length];
      select(target);
      target.focus();
    });
  });

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
  els.chips.append(h('button', { type: 'button', className: 'st-btn st-btn--outline st-btn--sm', textContent: q, onclick: () => ask(q) }));
}

showEmpty(els.kw, 'Ask a question to see the top 3 chunks.');
showEmpty(els.em, 'Ask a question to see the top 3 chunks.');
setupHelp();
setupGuide();
setupTheme();
applyChunking();
startModelLoad();
