// Roadmap page: create AI roadmaps, see the weekly trail, check off topics.
import { getAll, get, put, putMany, del, delByIndex, getAllByIndex, uid } from '../db.js';
import { askAI, RETRYABLE } from '../ai-client.js';
import { pathProgress } from '../progress.js';
import { startFocusFor } from '../timer.js';
import { navigate, refresh } from '../router.js';
import { icon } from '../icons.js';
import { esc, openModal, confirmModal, toast, progressBar, emptyState, setLoading, clampPct, skeleton, $ } from '../ui.js';

const LEVELS = [
  ['beginner', 'Beginner'],
  ['intermediate', 'Intermediate'],
  ['advanced', 'Advanced'],
];

export async function render(root, { query }) {
  root.innerHTML = `<div class="page">${header()}<div class="card">${skeleton(5)}</div></div>`;
  const paths = (await getAll('paths')).sort((a, b) => b.createdAt - a.createdAt);

  if (!paths.length) {
    root.innerHTML = `<div class="page">${header(false)}
      ${emptyState({
        iconName: 'map',
        title: 'No roadmap yet',
        text: 'Tell LearnPath what you want to learn, your level and how much time you have. The AI builds a week-by-week plan for you.',
        action: `<button class="btn btn-primary" data-new>${icon('sparkles')}Create my first roadmap</button>`,
      })}</div>`;
    root.querySelector('[data-new]').addEventListener('click', openCreateForm);
    return;
  }

  const selectedId = query.get('path') || (paths.find((p) => p.active) || paths[0]).id;
  const prog = await pathProgress(selectedId);
  if (!prog) {
    navigate('#/roadmap');
    return;
  }
  const { path, weeks, topicPct, materials } = prog;

  root.innerHTML = `<div class="page">
    ${header()}
    <div class="roadmap-layout">
      <aside class="stack-sm" aria-label="Your roadmaps">
        <h2 class="small muted strong">Your roadmaps</h2>
        <div class="path-list">${paths.map((p) => pathItem(p, p.id === path.id)).join('')}</div>
      </aside>

      <section class="stack" aria-labelledby="path-title">
        <div class="card stack">
          <div class="row-between">
            <div class="stack-sm grow">
              <div class="row wrap">
                <h2 id="path-title">${esc(path.title)}</h2>
                ${path.active ? `<span class="badge badge-accent">${icon('target')}Active</span>` : ''}
                ${path.source === 'sample' ? '<span class="badge badge-warning">Sample plan</span>' : `<span class="badge">${icon('sparkles')}AI plan</span>`}
              </div>
              <p class="small muted">${esc(path.goal)} · ${esc(cap(path.level))} · ${path.hoursPerWeek} h/week · ${weeks.length} weeks</p>
            </div>
            <div class="page-actions">
              ${path.active ? '' : `<button class="btn btn-secondary btn-sm" data-activate>${icon('target')}Set active</button>`}
              <button class="btn btn-ghost btn-sm" data-delete aria-label="Delete this roadmap">${icon('trash')}Delete</button>
            </div>
          </div>
          ${progressBar({ label: 'Overall progress', percent: prog.overall })}
        </div>

        <ol class="trail" aria-label="Weekly plan">
          ${weeks.map((w) => weekCard(w, topicPct, materials)).join('')}
        </ol>
      </section>
    </div>
  </div>`;

  // ---- events (one delegated listener for the whole page) ----
  // Listen on the page wrapper (recreated each render), not on #main, so listeners never pile up.
  const page = root.firstElementChild;
  page.querySelector('[data-new]').addEventListener('click', openCreateForm);
  page.addEventListener('click', async (e) => {
    const t = e.target.closest('button, a');
    if (!t) return;
    if (t.dataset.path) navigate(`#/roadmap?path=${t.dataset.path}`);
    if (t.hasAttribute('data-activate')) {
      await setActive(path.id);
      toast('This roadmap is now active. The dashboard and Pomodoro use it.', 'success');
      refresh();
    }
    if (t.hasAttribute('data-delete')) {
      const ok = await confirmModal({
        title: 'Delete this roadmap?',
        message: `"${path.title}" and its topics, PDFs and page progress will be removed from this browser. This cannot be undone.`,
        confirmLabel: 'Delete roadmap',
        danger: true,
      });
      if (ok) {
        await deletePath(path.id);
        toast('Roadmap deleted.', 'success');
        navigate('#/roadmap');
      }
    }
    if (t.dataset.study) {
      startFocusFor(t.dataset.study, path.id);
      navigate('#/pomodoro');
    }
  });

  page.addEventListener('change', async (e) => {
    if (!e.target.matches('[data-topic-check]')) return;
    const topic = await get('topics', e.target.dataset.topicCheck);
    await put('topics', { ...topic, done: e.target.checked, doneAt: e.target.checked ? Date.now() : null });
    refresh();
  });
}

// ---------- pieces ----------
function header(withButton = true) {
  return `<header class="page-header">
    <div><h1>Roadmap</h1><p>Your week-by-week study plan. Check off topics as you finish them.</p></div>
    ${withButton ? `<div class="page-actions"><button class="btn btn-primary" data-new>${icon('plus')}New roadmap</button></div>` : ''}
  </header>`;
}

const cap = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);

function pathItem(p, selected) {
  return `<button class="path-item" data-path="${p.id}" ${selected ? 'aria-current="true"' : ''}>
    <span class="row-between"><span class="path-item-title">${esc(p.title)}</span>${p.active ? '<span class="badge badge-accent">Active</span>' : ''}</span>
    <span class="xs muted">${p.weeks} weeks · ${p.hoursPerWeek} h/week</span>
  </button>`;
}

function weekCard(w, topicPct, materials) {
  const pct = clampPct(w.percent);
  const done = pct >= 100;
  return `<li class="week">
    <div class="week-node ${done ? 'is-done' : ''}" style="--fill:${pct}%" aria-hidden="true"><span>${done ? icon('check') : w.week}</span></div>
    <div class="card week-card">
      <div class="week-head">
        <div class="stack-sm grow">
          <h3>Week ${w.week}: ${esc(w.title)}</h3>
          ${w.focus ? `<p class="week-focus">${esc(w.focus)}</p>` : ''}
        </div>
        <span class="badge ${done ? 'badge-success' : pct > 0 ? 'badge-accent' : ''}">${pct}% done</span>
      </div>
      <ul class="topic-list">
        ${w.topics.map((t) => topicRow(t, topicPct.get(t.id), materials.filter((m) => m.topicId === t.id).length)).join('')}
      </ul>
    </div>
  </li>`;
}

function topicRow(t, pct, materialCount) {
  const id = `topic-${t.id}`;
  return `<li class="topic ${t.done ? 'is-done' : ''}">
    <input type="checkbox" class="topic-check" id="${id}" data-topic-check="${t.id}" ${t.done ? 'checked' : ''}>
    <label for="${id}" class="topic-label grow">
      <span class="topic-title">${esc(t.title)}</span>
      ${t.description ? `<span class="xs muted">${esc(t.description)}</span>` : ''}
    </label>
    <span class="topic-meta">
      <span class="badge">${icon('clock')}${t.estHours} h</span>
      ${materialCount ? `<span class="badge ${pct >= 100 ? 'badge-success' : 'badge-accent'}">${icon('file')}${clampPct(pct)}%</span>` : ''}
    </span>
    <span class="topic-actions">
      <button class="btn btn-ghost btn-sm" data-study="${t.id}" aria-label="Start a focus session for ${esc(t.title)}">${icon('play')}Study</button>
      <a class="btn btn-ghost btn-sm" href="#/materials?topic=${t.id}" aria-label="Study material for ${esc(t.title)}">${icon('book')}Material</a>
    </span>
  </li>`;
}

// ---------- create a roadmap ----------
// Roadmaps are always generated in English: free models are only reliable in English.
async function openCreateForm() {
  const body = `<form class="stack" id="roadmap-form" novalidate>
    <div class="field">
      <label class="label" for="rf-goal">What do you want to learn?</label>
      <input class="input" id="rf-goal" name="goal" required maxlength="200" placeholder="e.g. Class 12 Physics: Electrostatics, or Learn JavaScript basics">
      <span class="field-error" id="rf-goal-error" hidden>Please describe your goal (at least 3 characters).</span>
    </div>
    <div class="grid-3">
      <div class="field">
        <label class="label" for="rf-level">Your level</label>
        <select class="select" id="rf-level" name="level">${LEVELS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
      </div>
      <div class="field">
        <label class="label" for="rf-hours">Hours per week</label>
        <input class="input" id="rf-hours" name="hours" type="number" min="1" max="40" value="6" required>
      </div>
      <div class="field">
        <label class="label" for="rf-weeks">Number of weeks</label>
        <input class="input" id="rf-weeks" name="weeks" type="number" min="1" max="24" value="4" required>
      </div>
    </div>
    <div id="rf-status" aria-live="polite"></div>
  </form>`;

  const modal = openModal({
    title: 'Create a roadmap',
    body,
    actions: [
      { label: 'Cancel', variant: 'secondary', value: null },
      { label: 'Generate roadmap', variant: 'primary', onClick: (btn, el) => submitForm(btn, el, modal) },
    ],
  });
  // Pressing Enter in a field also submits (the buttons live outside the <form>).
  const form = $('#roadmap-form', modal.el);
  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('input')) {
      e.preventDefault();
      modal.el.querySelector('.modal-footer .btn-primary').click();
    }
  });
}

function readForm(el) {
  const form = $('#roadmap-form', el);
  const goal = form.goal.value.trim();
  const valid = goal.length >= 3;
  $('#rf-goal-error', el).hidden = valid;
  form.goal.setAttribute('aria-invalid', String(!valid));
  if (!valid) {
    form.goal.focus();
    return null;
  }
  return {
    goal,
    level: form.level.value,
    language: 'en',
    hoursPerWeek: Math.max(1, Math.min(40, Number(form.hours.value) || 6)),
    weeks: Math.max(1, Math.min(24, Number(form.weeks.value) || 4)),
  };
}

// Generate with the AI. While waiting, show a timer. If the free AI is busy or slow,
// retry automatically (up to 3 tries in total). We never make a fake/sample plan:
// if every try fails, the student sees why and can click "Try again".
const MAX_TRIES = 3;

async function submitForm(btn, el, modal) {
  const details = readForm(el);
  if (!details) return false;
  const status = $('#rf-status', el);

  let closed = false;
  modal.result.then(() => (closed = true));

  setLoading(btn, true);
  const started = Date.now();
  let attempt = 1;
  const showWaiting = () => {
    const secs = Math.round((Date.now() - started) / 1000);
    const retryNote = attempt > 1 ? ` (the AI was busy, trying again: ${attempt} of ${MAX_TRIES})` : '';
    status.innerHTML = `<div class="alert" role="status">${icon('sparkles')}<div><strong>Building your plan with free AI... ${secs}s</strong>${esc(retryNote)}<br>
      <span class="xs muted">This usually takes 10 to 40 seconds. Please keep this window open.</span></div></div>`;
  };
  showWaiting();
  const timer = setInterval(showWaiting, 1000);

  const input = `Goal: ${details.goal}
Level: ${details.level}
Hours per week: ${details.hoursPerWeek}
Number of weeks: ${details.weeks}`;
  let result = await askAI('roadmap', input, 'en');
  while (!result.ok && RETRYABLE.includes(result.error) && attempt < MAX_TRIES && !closed) {
    attempt += 1;
    showWaiting();
    await new Promise((r) => setTimeout(r, 3000)); // short pause so a busy model can recover
    if (closed) break;
    result = await askAI('roadmap', input, 'en', { isRetry: true });
  }
  clearInterval(timer);
  setLoading(btn, false);
  if (closed) return false; // the student cancelled while waiting

  if (result.ok) {
    const pathId = await savePlan(result.data, details);
    toast(result.cached ? 'Roadmap ready (from cache).' : 'Your AI roadmap is ready!', 'success');
    modal.close(true);
    navigate(`#/roadmap?path=${pathId}`);
    return false;
  }

  // Every try failed: explain why. Nothing is saved, so no fake plan appears.
  btn.textContent = 'Try again';
  const tries = attempt > 1 ? ` (tried ${attempt} times)` : '';
  status.innerHTML = `<div class="alert alert-warning" role="alert">${icon('alert')}<div>
      <strong>The AI could not make your plan${esc(tries)}.</strong> ${esc(result.message)}
      ${RETRYABLE.includes(result.error) ? '<br><span class="xs">Free AI models are sometimes busy. Wait a minute, then click "Try again".</span>' : ''}
    </div></div>`;
  return false; // keep the dialog open
}

async function savePlan(plan, details) {
  const pathId = uid();
  const now = Date.now();
  const all = await getAll('paths');
  await putMany('paths', all.map((p) => ({ ...p, active: false })));
  await put('paths', {
    id: pathId,
    title: plan.title || `${details.goal}: study plan`,
    goal: details.goal,
    level: details.level,
    hoursPerWeek: details.hoursPerWeek,
    weeks: plan.weeks.length,
    language: details.language,
    weekInfo: plan.weeks.map((w, i) => ({ week: i + 1, title: w.title || `Week ${i + 1}`, focus: w.focus || '' })),
    active: true,
    source: 'ai',
    createdAt: now,
  });
  const topics = [];
  plan.weeks.forEach((w, wi) => {
    w.topics.forEach((t, ti) => {
      topics.push({ id: uid(), pathId, week: wi + 1, order: ti, title: t.title, description: t.description || '', estHours: Number(t.estHours) || 1, done: false, doneAt: null });
    });
  });
  await putMany('topics', topics);
  return pathId;
}

async function setActive(pathId) {
  const all = await getAll('paths');
  await putMany('paths', all.map((p) => ({ ...p, active: p.id === pathId })));
}

async function deletePath(pathId) {
  const materials = await getAllByIndex('materials', 'pathId', pathId);
  for (const m of materials) await delByIndex('page_progress', 'materialId', m.id);
  await delByIndex('materials', 'pathId', pathId);
  await delByIndex('topics', 'pathId', pathId);
  const path = await get('paths', pathId);
  await del('paths', pathId);
  // Keep one roadmap active if any remain.
  if (path?.active) {
    const rest = (await getAll('paths')).sort((a, b) => b.createdAt - a.createdAt);
    if (rest.length) await setActive(rest[0].id);
  }
}
