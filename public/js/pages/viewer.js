// Viewer page: read a PDF with PDF.js, track real reading time per page,
// and use the AI Study Buddy (Explain simply, Quiz me, Read aloud) on the current page.
import { get, put, getAllByIndex, uid } from '../db.js';
import { openPdf, pageText, closePdf } from '../pdf-loader.js';
import { askAI, aiRequestsLeft, DAILY_LIMIT } from '../ai-client.js';
import { getSetting, LANGUAGE_OPTIONS, SPEECH_LANG } from '../settings.js';
import { icon } from '../icons.js';
import { esc, toast, progressBar, emptyState, alertBox, setLoading, clampPct, $, $$ } from '../ui.js';

const DWELL_MS = 5000; // a page counts as read after 5 seconds on it
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;

export async function render(root, { param, query }) {
  const material = await get('materials', param);
  if (!material) {
    root.innerHTML = `<div class="page"><header class="page-header"><div><h1>PDF not found</h1></div></header>
      ${emptyState({ iconName: 'file', title: 'This PDF is not in this browser', text: 'It may have been deleted. PDFs are stored only on the device where you uploaded them.', action: `<a class="btn btn-primary" href="#/materials">Back to Study Material</a>` })}</div>`;
    return;
  }
  const topic = material.topicId ? await get('topics', material.topicId) : null; // null = general reading
  const language = await getSetting('language');
  const languageName = (LANGUAGE_OPTIONS.find(([v]) => v === language) || [, 'English'])[1];

  // ---- state ----
  const progress = new Map(); // page -> { id, materialId, page, seconds, completed, visitedAt }
  (await getAllByIndex('page_progress', 'materialId', material.id)).forEach((r) => progress.set(r.page, r));
  const total = material.totalPages;
  // Last page + zoom live in a tiny "reader:<id>" settings record, so page turns
  // never rewrite the (large) PDF record.
  const readerKey = `reader:${material.id}`;
  const reader = (await get('settings', readerKey))?.value || {};
  let current = clampPage(Number(query.get('page')) || reader.lastPage || 1);
  let zoom = reader.zoom || 1.2;
  const saveReader = () => put('settings', { key: readerKey, value: { lastPage: current, zoom } });
  let pdf = null;
  let renderTask = null;
  let dwellMs = 0; // time spent on the current page in this visit
  let lastTick = Date.now();
  let saveCounter = 0;
  let speaking = false;
  let explainBullets = null;

  function clampPage(n) {
    return Math.max(1, Math.min(total, Math.round(n) || 1));
  }

  root.innerHTML = `<div class="viewer">
    <section class="viewer-main" aria-label="PDF reader">
      <div class="viewer-toolbar" role="toolbar" aria-label="Reader controls">
        <a class="btn btn-ghost btn-sm btn-icon" href="#/materials" aria-label="Back to Study Material">${icon('arrowLeft')}</a>
        <h1 class="viewer-title grow" title="${esc(material.name)}">${esc(material.name)}</h1>
        <div class="toolbar-group">
          <button class="btn btn-ghost btn-sm btn-icon" id="v-prev" aria-label="Previous page (Left arrow)">${icon('chevronLeft')}</button>
          <label class="sr-only" for="v-page">Page number</label>
          <input class="input input-sm page-input" id="v-page" type="number" min="1" max="${total}" value="${current}">
          <span class="small muted nowrap">of ${total}</span>
          <button class="btn btn-ghost btn-sm btn-icon" id="v-next" aria-label="Next page (Right arrow)">${icon('chevronRight')}</button>
        </div>
        <span class="toolbar-sep"></span>
        <div class="toolbar-group">
          <button class="btn btn-ghost btn-sm btn-icon" id="v-zoom-out" aria-label="Zoom out (minus)">${icon('zoomOut')}</button>
          <span class="zoom-value" id="v-zoom">${Math.round(zoom * 100)}%</span>
          <button class="btn btn-ghost btn-sm btn-icon" id="v-zoom-in" aria-label="Zoom in (plus)">${icon('zoomIn')}</button>
        </div>
        <span class="toolbar-sep"></span>
        <span class="dwell-indicator" id="v-dwell" aria-live="polite"></span>
        <span class="badge badge-accent" id="v-pct">0%</span>
      </div>
      <div class="viewer-canvas-wrap" id="v-wrap">
        <canvas id="v-canvas" aria-label="PDF page"></canvas>
      </div>
    </section>

    <aside class="viewer-side" aria-label="Progress and Study Buddy">
      <div class="stack-sm">
        <p class="xs muted">${esc(topic?.title || 'General reading (no topic)')}</p>
        <div id="v-progress"></div>
      </div>
      <div class="stack-sm">
        <h2 class="small strong">Pages</h2>
        <div class="page-map" id="v-map" role="list" aria-label="Page completion map"></div>
        <p class="xs muted">${icon('info', 'sr-only')}Green = read (5 s or more). Blue = visited.</p>
      </div>
      <hr class="divider">
      <section class="stack" aria-labelledby="buddy-title">
        <div class="row-between">
          <h2 id="buddy-title" class="buddy-title">${icon('sparkles')}Study Buddy</h2>
          <span class="badge" id="v-ai-left"></span>
        </div>
        <p class="xs muted">Works on the current page. Answers in ${esc(languageName)} (change in Settings). Only this page's text is sent to the AI.</p>
        <div class="row">
          <button class="btn btn-secondary btn-sm grow" id="v-explain">${icon('sparkles')}Explain simply</button>
          <button class="btn btn-secondary btn-sm grow" id="v-quiz">${icon('quiz')}Quiz me</button>
        </div>
        <div id="v-buddy" class="buddy-output" aria-live="polite"></div>
      </section>
    </aside>
  </div>`;

  const view = root.firstElementChild;
  const canvas = $('#v-canvas', view);
  const els = {
    pageInput: $('#v-page', view),
    zoom: $('#v-zoom', view),
    dwell: $('#v-dwell', view),
    pct: $('#v-pct', view),
    map: $('#v-map', view),
    progress: $('#v-progress', view),
    buddy: $('#v-buddy', view),
    aiLeft: $('#v-ai-left', view),
  };

  // ---------- progress display ----------
  const completedCount = () => [...progress.values()].filter((r) => r.completed).length;

  function renderProgress() {
    const pct = (completedCount() / total) * 100;
    els.pct.textContent = `${clampPct(pct)}% read`;
    els.progress.innerHTML = progressBar({ label: `${completedCount()} of ${total} pages read`, percent: pct });
  }

  function renderMap() {
    els.map.innerHTML = Array.from({ length: total }, (_, i) => {
      const n = i + 1;
      const r = progress.get(n);
      const cls = r?.completed ? 'is-done' : r ? 'is-visited' : '';
      const state = r?.completed ? 'read' : r ? 'visited' : 'not visited';
      return `<button class="page-cell ${cls} ${n === current ? 'is-current' : ''}" data-page="${n}" role="listitem" aria-label="Page ${n}, ${state}" ${n === current ? 'aria-current="page"' : ''}>${n}</button>`;
    }).join('');
  }

  function renderDwell() {
    const r = progress.get(current);
    if (r?.completed) {
      els.dwell.innerHTML = `<span class="text-success">${icon('checkCircle')}</span>Page counted`;
    } else {
      const s = Math.min(5, Math.floor(dwellMs / 1000));
      els.dwell.innerHTML = `${icon('clock')}Reading ${s}/5 s`;
    }
  }

  async function renderAiLeft() {
    els.aiLeft.textContent = `${await aiRequestsLeft()}/${DAILY_LIMIT} AI left`;
  }

  // ---------- saving reading progress ----------
  async function saveCurrent() {
    const r = progress.get(current);
    if (r) await put('page_progress', r);
  }

  // Called about every 500 ms. Uses real elapsed time and only counts while the tab is visible.
  async function tick() {
    const now = Date.now();
    const elapsed = Math.min(now - lastTick, 2000); // ignore long gaps (sleeping laptop)
    lastTick = now;
    if (document.hidden || !pdf) return;
    dwellMs += elapsed;
    let r = progress.get(current);
    if (!r) {
      r = { id: `${material.id}:${current}`, materialId: material.id, page: current, seconds: 0, completed: false, visitedAt: now };
      progress.set(current, r);
      renderMap();
    }
    r.seconds = Math.round((r.seconds + elapsed / 1000) * 10) / 10;
    r.visitedAt = now;
    if (!r.completed && dwellMs >= DWELL_MS) {
      r.completed = true;
      await saveCurrent();
      renderMap();
      renderProgress();
      if (completedCount() === total) toast('You have read every page of this PDF. Well done!', 'success');
    } else if (++saveCounter % 10 === 0) {
      await saveCurrent(); // save seconds every ~5 s
    }
    renderDwell();
  }

  // ---------- rendering pages ----------
  async function showPage(n) {
    n = clampPage(n);
    await saveCurrent();
    current = n;
    dwellMs = 0;
    lastTick = Date.now();
    els.pageInput.value = String(n);
    explainBullets = null;
    stopSpeaking();
    els.buddy.innerHTML = '';
    renderMap();
    renderDwell();
    $('.page-cell.is-current', view)?.scrollIntoView({ block: 'nearest' });
    saveReader();
    await draw();
  }

  async function draw() {
    if (!pdf) return;
    const page = await pdf.getPage(current);
    const dpr = window.devicePixelRatio || 1;
    const viewport = page.getViewport({ scale: zoom * dpr });
    if (renderTask) renderTask.cancel();
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
    canvas.setAttribute('aria-label', `Page ${current} of ${total}`);
    renderTask = page.render({ canvas, viewport });
    try {
      await renderTask.promise;
    } catch (err) {
      if (err?.name !== 'RenderingCancelledException') console.error(err);
    }
  }

  function setZoom(z) {
    zoom = Math.round(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z)) * 10) / 10;
    els.zoom.textContent = `${Math.round(zoom * 100)}%`;
    saveReader();
    draw();
  }

  // ---------- Study Buddy ----------
  async function currentText() {
    const page = await pdf.getPage(current);
    return (await pageText(page)).slice(0, 4000);
  }

  async function runExplain(btn) {
    const text = await currentText();
    if (text.length < 20) {
      els.buddy.innerHTML = alertBox('This page has no readable text (it may be a scanned image), so the AI cannot read it. Try another page.', 'warning');
      return;
    }
    setLoading(btn, true);
    els.buddy.innerHTML = '<div class="stack-sm" aria-label="Loading"><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line"></div></div>';
    const pageAtStart = current;
    const res = await askAI('explain', text, language);
    setLoading(btn, false);
    renderAiLeft();
    if (pageAtStart !== current) return; // the student moved on
    if (!res.ok) {
      els.buddy.innerHTML = alertBox(res.message, 'warning');
      return;
    }
    explainBullets = res.data.bullets;
    els.buddy.innerHTML = `<div class="card card-tight stack-sm">
      <div class="row-between"><h3 class="small strong">Page ${current} in simple words</h3>${res.cached ? '<span class="badge">Saved answer</span>' : ''}</div>
      <ul>${explainBullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
      <button class="btn btn-ghost btn-sm" id="v-speak">${icon('volume')}Read aloud</button>
    </div>`;
  }

  async function runQuiz(btn) {
    const text = await currentText();
    if (text.length < 20) {
      els.buddy.innerHTML = alertBox('This page has no readable text (it may be a scanned image), so a quiz cannot be made. Try another page.', 'warning');
      return;
    }
    stopSpeaking();
    setLoading(btn, true);
    els.buddy.innerHTML = '<div class="stack-sm" aria-label="Loading"><div class="skeleton skeleton-block"></div><div class="skeleton skeleton-block"></div></div>';
    const pageAtStart = current;
    const res = await askAI('quiz', text, language);
    setLoading(btn, false);
    renderAiLeft();
    if (pageAtStart !== current) return;
    if (!res.ok) {
      els.buddy.innerHTML = alertBox(res.message, 'warning');
      return;
    }
    const questions = res.data.questions;
    const answers = new Array(questions.length).fill(null);
    els.buddy.innerHTML = `<div class="stack-sm" id="v-quiz-box">
      <div class="row-between"><h3 class="small strong">Quiz on page ${current}</h3>${res.cached ? '<span class="badge">Saved quiz</span>' : ''}</div>
      ${questions.map((q, qi) => `<div class="quiz-card" data-q="${qi}">
        <p class="quiz-q">${qi + 1}. ${esc(q.question)}</p>
        ${q.options.map((o, oi) => `<button class="quiz-option" data-q="${qi}" data-o="${oi}"><span class="badge">${'ABCD'[oi]}</span><span class="grow">${esc(o)}</span></button>`).join('')}
        <p class="quiz-explain" hidden></p>
      </div>`).join('')}
      <div id="v-quiz-score" aria-live="polite"></div>
    </div>`;

    $('#v-quiz-box', view).addEventListener('click', async (e) => {
      const opt = e.target.closest('.quiz-option');
      if (!opt) return;
      const qi = Number(opt.dataset.q);
      const oi = Number(opt.dataset.o);
      if (answers[qi] !== null) return;
      answers[qi] = oi;
      const q = questions[qi];
      const card = opt.closest('.quiz-card');
      $$('.quiz-option', card).forEach((b) => {
        b.disabled = true;
        const idx = Number(b.dataset.o);
        if (idx === q.correct) b.classList.add('is-correct');
        else if (idx === oi) b.classList.add('is-wrong');
      });
      const explain = $('.quiz-explain', card);
      explain.hidden = false;
      explain.textContent = `${oi === q.correct ? 'Correct!' : `Not quite. Answer: ${'ABCD'[q.correct]}.`} ${q.explanation || ''}`;

      if (answers.every((a) => a !== null)) {
        const score = answers.filter((a, i) => a === questions[i].correct).length;
        await put('quiz_attempts', { id: uid(), topicId: material.topicId, materialId: material.id, page: current, score, total: questions.length, createdAt: Date.now() });
        $('#v-quiz-score', view).innerHTML = alertBox(`You scored ${score} of ${questions.length}. Saved to your topic.`, score === questions.length ? 'success' : 'info');
      }
    });
  }

  // ---------- Read aloud (browser text-to-speech) ----------
  function speak() {
    if (!('speechSynthesis' in window)) {
      toast('Read aloud is not supported in this browser.', 'warning');
      return;
    }
    if (speaking) {
      stopSpeaking();
      return;
    }
    if (!explainBullets) return;
    const utter = new SpeechSynthesisUtterance(explainBullets.join('. '));
    utter.lang = SPEECH_LANG[language] || 'en-IN';
    const voice = speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(utter.lang.slice(0, 2)));
    if (voice) utter.voice = voice;
    else if (language !== 'en') toast('No voice for this language is installed, so your browser may use a default voice.', 'info');
    utter.onend = () => {
      speaking = false;
      updateSpeakButton();
    };
    speaking = true;
    speechSynthesis.cancel();
    speechSynthesis.speak(utter);
    updateSpeakButton();
  }

  function stopSpeaking() {
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    speaking = false;
    updateSpeakButton();
  }

  function updateSpeakButton() {
    const b = $('#v-speak', view);
    if (b) b.innerHTML = speaking ? `${icon('stop')}Stop reading` : `${icon('volume')}Read aloud`;
  }

  // ---------- events ----------
  $('#v-prev', view).addEventListener('click', () => showPage(current - 1));
  $('#v-next', view).addEventListener('click', () => showPage(current + 1));
  $('#v-zoom-in', view).addEventListener('click', () => setZoom(zoom + 0.1));
  $('#v-zoom-out', view).addEventListener('click', () => setZoom(zoom - 0.1));
  els.pageInput.addEventListener('change', () => showPage(Number(els.pageInput.value)));
  els.map.addEventListener('click', (e) => {
    const cell = e.target.closest('[data-page]');
    if (cell) showPage(Number(cell.dataset.page));
  });
  $('#v-explain', view).addEventListener('click', (e) => runExplain(e.currentTarget));
  $('#v-quiz', view).addEventListener('click', (e) => runQuiz(e.currentTarget));
  els.buddy.addEventListener('click', (e) => {
    if (e.target.closest('#v-speak')) speak();
  });

  function onKey(e) {
    if (e.target.closest('input, select, textarea, [contenteditable]') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector('.modal-backdrop')) return;
    const map = {
      ArrowRight: () => showPage(current + 1),
      PageDown: () => showPage(current + 1),
      ArrowLeft: () => showPage(current - 1),
      PageUp: () => showPage(current - 1),
      Home: () => showPage(1),
      End: () => showPage(total),
      '+': () => setZoom(zoom + 0.1),
      '=': () => setZoom(zoom + 0.1),
      '-': () => setZoom(zoom - 0.1),
      0: () => setZoom(1.2),
    };
    const action = map[e.key];
    if (action) {
      e.preventDefault();
      action();
    }
  }
  document.addEventListener('keydown', onKey);
  const onVisibility = () => {
    lastTick = Date.now();
    if (document.hidden) saveCurrent();
  };
  document.addEventListener('visibilitychange', onVisibility);
  const onUnload = () => saveCurrent();
  window.addEventListener('beforeunload', onUnload);

  // ---------- start ----------
  renderProgress();
  renderMap();
  renderDwell();
  renderAiLeft();
  const ticker = setInterval(tick, 500);

  try {
    pdf = await openPdf(material.blob);
    lastTick = Date.now();
    await showPage(current);
  } catch (err) {
    console.error(err);
    $('#v-wrap', view).innerHTML = alertBox('This PDF could not be opened. It may be damaged. Try deleting and uploading it again.', 'error');
  }

  // Cleanup when leaving the page.
  return () => {
    clearInterval(ticker);
    saveCurrent();
    stopSpeaking();
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('beforeunload', onUnload);
    if (renderTask) renderTask.cancel();
    closePdf(pdf);
  };
}
