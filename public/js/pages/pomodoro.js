// Pomodoro page: big countdown ring, controls, session dots, topic link and today's sessions.
import { getAllByIndex, get } from '../db.js';
import { getActivePath } from '../progress.js';
import { getSetting, setSetting, POMODORO_LIMITS } from '../settings.js';
import { subscribe, toggle, skip, reset, setTopic, getTimer } from '../timer.js';
import { icon } from '../icons.js';
import { esc, ring, setRing, formatClock, formatMinutes, dateKey, emptyState, toast, checkNumberField, $ } from '../ui.js';

// Quick presets: [label, focus, short break, long break]
const PRESETS = [
  ['25 / 5', 25, 5, 15],
  ['45 / 10', 45, 10, 20],
  ['50 / 10', 50, 10, 30],
  ['90 / 20', 90, 20, 30],
];
const LENGTH_KEYS = ['focus', 'short', 'long', 'cyclesBeforeLong'];

export async function render(root) {
  const active = await getActivePath();
  const topics = active ? (await getAllByIndex('topics', 'pathId', active.id)).sort((a, b) => a.week - b.week || a.order - b.order) : [];
  const t = getTimer();
  const prefs = await getSetting('pomodoro');

  // Topic picker grouped by week.
  const weeks = [...new Set(topics.map((x) => x.week))];
  const topicOptions = weeks
    .map((w) => `<optgroup label="Week ${w}">${topics.filter((x) => x.week === w).map((x) => `<option value="${x.id}" ${x.id === t.topicId ? 'selected' : ''}>${esc(x.title)}${x.done ? ' (done)' : ''}</option>`).join('')}</optgroup>`)
    .join('');

  root.innerHTML = `<div class="page">
    <header class="page-header">
      <div><h1>Pomodoro</h1><p>Focus in short blocks with breaks in between. Each focus session is saved to a topic.</p></div>
    </header>
    <div class="pomo-layout">
      <section class="card pomo-main phase-${t.phase}" id="pomo-card" aria-label="Timer">
        <div class="pomo-phase" id="pomo-phase">${icon('timer')}<span>${t.label}</span></div>
        ${ring({ size: 300, stroke: 14, percent: 100, className: 'pomo-ring', label: 'Time remaining', center: `<div class="ring-value" id="pomo-time" aria-live="off">${formatClock(t.remaining)}</div><div class="small muted" id="pomo-sub"></div>` })}
        <div class="session-dots" id="pomo-dots" aria-label="Sessions in this cycle"></div>
        <div class="pomo-controls">
          <button class="btn btn-ghost btn-icon" id="pomo-reset" aria-label="Reset timer" title="Reset">${icon('reset')}</button>
          <button class="btn btn-primary btn-lg" id="pomo-toggle"></button>
          <button class="btn btn-ghost btn-icon" id="pomo-skip" aria-label="Skip to next phase" title="Skip (S)">${icon('skip')}</button>
        </div>
        <div class="field pomo-topic-field">
          <label class="label" for="pomo-topic">Studying</label>
          ${topics.length
            ? `<select class="select" id="pomo-topic"><option value="">No topic (free study)</option>${topicOptions}</select>`
            : `<p class="small muted">Create a roadmap to link sessions to topics. <a href="#/roadmap">Go to Roadmap</a></p>`}
        </div>
        <p class="xs muted"><span class="kbd">Space</span> start or pause · <span class="kbd">S</span> skip</p>
      </section>

      <aside class="stack">
        <div class="card">
          <div class="card-header"><h2>Timer lengths</h2><span class="xs muted">minutes</span></div>
          <form class="stack" id="pomo-lengths" novalidate>
            <div class="row wrap" role="group" aria-label="Quick presets">
              ${PRESETS.map(([label, f, s, l]) => `<button type="button" class="btn btn-secondary btn-sm" data-preset="${f},${s},${l}" aria-label="Preset: ${f} minutes focus, ${s} minutes break">${label}</button>`).join('')}
            </div>
            <div class="form-grid">
              ${lengthField('focus', 'Focus', prefs.focus)}
              ${lengthField('short', 'Short break', prefs.short)}
              ${lengthField('long', 'Long break', prefs.long)}
              ${lengthField('cyclesBeforeLong', 'Long break after', prefs.cyclesBeforeLong, 'sessions', true)}
            </div>
            <div class="row-between">
              <span class="xs muted" id="pomo-lengths-note" aria-live="polite"></span>
              <button type="submit" class="btn btn-primary btn-sm">Save lengths</button>
            </div>
          </form>
        </div>
        <div class="card">
          <div class="card-header"><h2>Today</h2><span class="badge badge-accent" id="today-total">0 min</span></div>
          <div id="today-list"></div>
        </div>
        <div class="card">
          <div class="card-header"><h2>Options</h2></div>
          <div class="stack-sm">
            ${switchRow('autoStart', 'Auto-start next phase', prefs.autoStart)}
            ${switchRow('sound', 'Sound at phase end', prefs.sound)}
            ${switchRow('notify', 'Browser notification', prefs.notify)}
          </div>
        </div>
      </aside>
    </div>
  </div>`;

  const page = root.firstElementChild;
  const els = {
    card: $('#pomo-card', page),
    phase: $('#pomo-phase span', page),
    time: $('#pomo-time', page),
    sub: $('#pomo-sub', page),
    ring: $('.pomo-ring', page),
    dots: $('#pomo-dots', page),
    toggle: $('#pomo-toggle', page),
  };

  // Update only the parts that change (no full re-render every tick).
  let lastKey = '';
  const unsubscribe = subscribe((s) => {
    setRing(els.ring, s.fraction);
    const key = `${s.status}|${s.phase}|${s.cycle}|${s.cyclesBeforeLong}|${Math.ceil(s.remaining / 1000)}`;
    if (key === lastKey) return;
    lastKey = key;
    els.card.className = `card pomo-main phase-${s.phase}`;
    els.phase.textContent = s.label;
    els.time.textContent = formatClock(s.remaining);
    const n = s.cyclesBeforeLong;
    const doneInSet = s.phase === 'long' ? n : s.cycle % n;
    const current = Math.min(n, doneInSet + (s.phase === 'focus' ? 1 : 0));
    els.sub.textContent = s.phase === 'focus' ? `Session ${current} of ${n}` : s.status === 'idle' ? 'Break ready' : 'Relax';
    els.dots.innerHTML = Array.from({ length: n }, (_, i) => `<span class="session-dot ${i < doneInSet ? 'is-done' : ''}"></span>`).join('');
    els.dots.setAttribute('aria-label', `${doneInSet} of ${n} focus sessions done in this cycle`);
    const label = s.status === 'running' ? 'Pause' : s.status === 'paused' ? 'Resume' : s.phase === 'focus' ? 'Start focus' : 'Start break';
    els.toggle.innerHTML = `${icon(s.status === 'running' ? 'pause' : 'play')}${label}`;
  });

  els.toggle.addEventListener('click', toggle);
  $('#pomo-skip', page).addEventListener('click', skip);
  $('#pomo-reset', page).addEventListener('click', reset);
  $('#pomo-topic', page)?.addEventListener('change', (e) => setTopic(e.target.value, active?.id));

  page.addEventListener('change', async (e) => {
    const key = e.target.dataset.pref;
    if (!key) return;
    const current = await getSetting('pomodoro');
    const value = e.target.checked;
    if (key === 'notify' && value) {
      if (!('Notification' in window)) {
        toast('This browser does not support notifications.', 'warning');
        e.target.checked = false;
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        toast('Notifications are blocked. Allow them in your browser site settings.', 'warning');
        e.target.checked = false;
        return;
      }
    }
    await setSetting('pomodoro', { ...current, [key]: value });
  });

  // ---- Timer lengths: the student chooses them (checked while typing) ----
  const lengthsForm = $('#pomo-lengths', page);
  const note = $('#pomo-lengths-note', page);
  const check = (key, opts) => checkNumberField(lengthsForm.elements[key], $(`#pl-${key}-error`, page), POMODORO_LIMITS[key], opts);
  LENGTH_KEYS.forEach((key) => lengthsForm.elements[key].addEventListener('input', () => {
    check(key, { allowEmpty: true });
    note.textContent = 'Not saved yet';
  }));

  async function saveLengths() {
    const values = {};
    let firstBad = null;
    for (const key of LENGTH_KEYS) {
      values[key] = check(key);
      if (values[key] === null && !firstBad) firstBad = lengthsForm.elements[key];
    }
    if (firstBad) {
      firstBad.focus();
      note.textContent = '';
      return;
    }
    await setSetting('pomodoro', { ...(await getSetting('pomodoro')), ...values });
    // The timer picks up new lengths straight away when idle; a running/paused phase keeps its length.
    const busy = getTimer().status !== 'idle';
    note.textContent = 'Saved';
    toast(busy ? 'Saved. The current session keeps its length; the new lengths start from the next phase.' : `Saved: ${values.focus} min focus, ${values.short} min short break, ${values.long} min long break.`, 'success');
  }
  lengthsForm.addEventListener('submit', (e) => {
    e.preventDefault();
    saveLengths();
  });
  lengthsForm.addEventListener('click', (e) => {
    const preset = e.target.closest('[data-preset]');
    if (!preset) return;
    const [f, s, l] = preset.dataset.preset.split(',');
    Object.entries({ focus: f, short: s, long: l }).forEach(([k, v]) => (lengthsForm.elements[k].value = v));
    saveLengths();
  });

  // Keyboard shortcuts (ignored while typing in a field).
  function onKey(e) {
    if (e.target.closest('input, select, textarea, button, [contenteditable]') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector('.modal-backdrop')) return;
    if (e.code === 'Space') {
      e.preventDefault();
      toggle();
    } else if (e.key === 's' || e.key === 'S') {
      skip();
    }
  }
  document.addEventListener('keydown', onKey);

  const loadToday = () => renderToday(page);
  loadToday();
  window.addEventListener('pomodoro-phase-end', loadToday);

  return () => {
    unsubscribe();
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('pomodoro-phase-end', loadToday);
  };
}

// One number box. `rangeInUnit` puts "(2-8)" next to the unit instead of the label,
// for labels that are too long to fit with it on one line.
function lengthField(key, label, value, unit = 'min', rangeInUnit = false) {
  const { min, max } = POMODORO_LIMITS[key];
  const range = `(${min}-${max})`;
  return `<div class="field">
    <label class="label" for="pl-${key}">${label}${rangeInUnit ? '' : ` <span class="label-hint">${range}</span>`}</label>
    <div class="input-unit">
      <input class="input" type="number" id="pl-${key}" name="${key}" min="${min}" max="${max}" step="1" value="${value}" required aria-describedby="pl-${key}-error">
      <span class="xs muted nowrap" ${rangeInUnit ? '' : 'aria-hidden="true"'}>${unit}${rangeInUnit ? ` ${range}` : ''}</span>
    </div>
    <span class="field-error" id="pl-${key}-error" hidden></span>
  </div>`;
}

function switchRow(key, label, checked) {
  return `<label class="switch setting-row">
    <span class="small">${label}</span>
    <input type="checkbox" data-pref="${key}" ${checked ? 'checked' : ''}>
    <span class="switch-track" aria-hidden="true"></span>
  </label>`;
}

async function renderToday(page) {
  const start = new Date(dateKey() + 'T00:00:00').getTime();
  const sessions = await getAllByIndex('pomodoro_sessions', 'startedAt', IDBKeyRange.lowerBound(start));
  const total = sessions.reduce((sum, s) => sum + (s.minutes || 0), 0);
  $('#today-total', page).textContent = formatMinutes(total);
  const list = $('#today-list', page);
  if (!sessions.length) {
    list.innerHTML = emptyState({ iconName: 'clock', title: 'No sessions yet today', text: 'Start a focus session. It will show up here.' });
    return;
  }
  const rows = await Promise.all(
    sessions
      .sort((a, b) => b.startedAt - a.startedAt)
      .map(async (s) => {
        const topic = s.topicId ? await get('topics', s.topicId) : null;
        const time = new Date(s.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return `<li class="list-item">
          <span class="badge ${s.completed ? 'badge-success' : 'badge-warning'}">${s.completed ? 'Done' : 'Partial'}</span>
          <span class="grow small">${esc(topic?.title || 'Free study')}</span>
          <span class="xs muted nowrap">${time} · ${formatMinutes(s.minutes)}</span>
        </li>`;
      })
  );
  list.innerHTML = `<ul class="list">${rows.join('')}</ul>`;
}
