// Settings: Pomodoro durations, theme, AI language, accessibility, data export/import/reset,
// storage used, and the About / societal impact card.
import { getAll, putMany, clear, clearAll, STORE_NAMES, storageEstimate } from '../db.js';
import { getSetting, setSetting, getTheme, setTheme, clearSettingsCache, LANGUAGE_OPTIONS, POMODORO_LIMITS } from '../settings.js';
import { aiRequestsLeft, resetAiUsage, DAILY_LIMIT } from '../ai-client.js';
import { PLAN } from '../plan.js';
import { icon } from '../icons.js';
import { esc, toast, confirmModal, formatBytes, dateKey, setLoading, checkNumberField, $ } from '../ui.js';

// Exported stores: everything except the PDF files themselves.
const EXPORT_STORES = STORE_NAMES.filter((s) => s !== 'materials');

export async function render(root) {
  const pomo = await getSetting('pomodoro');
  const language = await getSetting('language');
  const a11y = await getSetting('a11y');
  const aiLeft = await aiRequestsLeft();
  const est = await storageEstimate();
  const materials = await getAll('materials');
  const pdfBytes = materials.reduce((s, m) => s + (m.size || 0), 0);

  root.innerHTML = `<div class="page">
    <header class="page-header"><div><h1>Settings</h1><p>Everything is saved in this browser only.</p></div></header>
    <div class="settings-layout">
      <div class="stack">
        <section class="card" aria-labelledby="s-pomo">
          <div class="card-header"><h2 id="s-pomo">Pomodoro</h2></div>
          <form class="stack" id="pomo-form" novalidate>
            <div class="form-grid">
              ${numField('focus', 'Focus', pomo.focus, 'min')}
              ${numField('short', 'Short break', pomo.short, 'min')}
              ${numField('long', 'Long break', pomo.long, 'min')}
              ${numField('cyclesBeforeLong', 'Long break after', pomo.cyclesBeforeLong, '')}
            </div>
            <p class="small" id="pomo-summary" aria-live="polite"></p>
            <div class="row"><button class="btn btn-primary" type="submit">Save durations</button>
              <button class="btn btn-ghost" type="button" id="pomo-default" title="Back to 25 min focus, 5 min short break, 15 min long break, long break after 4">Reset to default</button></div>
          </form>
        </section>

        <section class="card" aria-labelledby="s-look">
          <div class="card-header"><h2 id="s-look">Appearance and accessibility</h2></div>
          ${switchRow('theme', 'Dark theme', 'Easier on the eyes at night.', getTheme() === 'dark')}
          ${switchRow('readableFont', 'Easy-to-read font', 'Atkinson Hyperlegible with wider spacing; helps many dyslexic and low-vision readers.', a11y.readableFont)}
          ${switchRow('largeText', 'Large text', 'Makes all text about 12% bigger.', a11y.largeText)}
        </section>

        <section class="card" aria-labelledby="s-ai">
          <div class="card-header"><h2 id="s-ai">AI language</h2><span class="badge" id="s-ai-left">${icon('sparkles')}${aiLeft} / ${DAILY_LIMIT} left today</span></div>
          <div class="field">
            <label class="label" for="s-language">Study Buddy explanations and quizzes in</label>
            <select class="select" id="s-language">${LANGUAGE_OPTIONS.map(([v, l]) => `<option value="${v}" ${v === language ? 'selected' : ''}>${l}</option>`).join('')}</select>
            <span class="hint">English is the most reliable on free AI models. "Read aloud" uses your device's voices for the chosen language.</span>
          </div>
                  <div class="setting-row">
            <div><p class="small strong">AI requests today</p><p class="xs muted" id="s-ai-used"></p></div>
            <button class="btn btn-secondary btn-sm" type="button" id="s-ai-reset">${icon('reset')}Reset usage</button>
          </div>
        </section>
      </div>

      <div class="stack">
        <section class="card" aria-labelledby="s-data">
          <div class="card-header"><h2 id="s-data">Your data</h2></div>
          <div class="stack">
            <div class="row-between small"><span>Storage used by LearnPath</span><span class="strong">${est ? formatBytes(est.usage) : 'Unknown'}</span></div>
            <div class="row-between small"><span>PDFs (${materials.length})</span><span class="strong">${formatBytes(pdfBytes)}</span></div>
            <hr class="divider">
            <div class="setting-row"><div><p class="small strong">Export data</p><p class="xs muted">Download a JSON backup of roadmaps, progress, sessions, blocks and quizzes. PDFs are not included.</p></div>
              <button class="btn btn-secondary btn-sm" id="s-export">${icon('download')}Export</button></div>
            <div class="setting-row"><div><p class="small strong">Import data</p><p class="xs muted">Restore a LearnPath backup. This replaces your current data (PDFs stay).</p></div>
              <label class="btn btn-secondary btn-sm" for="s-import-file">${icon('upload')}Import</label>
              <input type="file" id="s-import-file" accept=".json,application/json" class="sr-only"></div>
            <div class="setting-row"><div><p class="small strong">Reset all data</p><p class="xs muted">Delete everything LearnPath stored in this browser, including PDFs.</p></div>
              <button class="btn btn-danger btn-sm" id="s-reset">${icon('trash')}Reset</button></div>
          </div>
        </section>

        <section class="card" aria-labelledby="s-about">
          <div class="card-header"><h2 id="s-about">About LearnPath</h2><span class="badge badge-warning">${icon('clock')}${PLAN.notice}</span></div>
          <div class="stack">
            <p class="small">LearnPath is built for students who can't afford paid coaching or study apps, especially first-generation learners and students in smaller towns.</p>
            <ul class="impact-list">
              <li>${icon('heart')}<span><strong>Free for a limited time.</strong> No subscription, no ads, no payment and no sign-up right now. Paid plans may be added later.</span></li>
              <li>${icon('lock')}<span><strong>Private by design.</strong> No accounts and no database of students. PDFs and progress stay in your browser. Only the text of one page is sent to the AI, and only when you click an AI button.</span></li>
              <li>${icon('globe')}<span><strong>Regional languages.</strong> English, Hindi, Tamil, Telugu, Kannada, Malayalam, Bengali and Marathi.</span></li>
              <li>${icon('eye')}<span><strong>Accessible.</strong> Read aloud, an easy-to-read font, large text, full keyboard use and high-contrast colors.</span></li>
              <li>${icon('wifi')}<span><strong>Low data use.</strong> Light pages, no heavy frameworks, and AI answers are saved so a page is never sent twice.</span></li>
              <li>${icon('checkCircle')}<span><strong>Honest progress.</strong> A page counts only after real reading time, which builds study habits instead of fake progress.</span></li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  </div>`;

  const page = root.firstElementChild;

  // Pomodoro durations
  const form = $('#pomo-form', page);
  const checkPomo = (key, opts) => checkNumberField(form.elements[key], $(`#pf-${key}-error`, form), POMODORO_LIMITS[key], opts);
  // Live summary under the boxes: shows exactly what the boxes say right now, and whether it is saved.
  const summary = $('#pomo-summary', form);
  let saved = { ...pomo };
  function updateSummary() {
    const v = Object.fromEntries(Object.keys(POMODORO_LIMITS).map((k) => [k, form.elements[k].value.trim() || '?']));
    const isSaved = Object.keys(POMODORO_LIMITS).every((k) => String(saved[k]) === v[k]);
    summary.innerHTML = `<strong>${esc(v.focus)} min</strong> focus · <strong>${esc(v.short)} min</strong> short break · <strong>${esc(v.long)} min</strong> long break · long break after <strong>${esc(v.cyclesBeforeLong)}</strong>
      <span class="badge ${isSaved ? 'badge-success' : 'badge-warning'}">${isSaved ? 'Saved' : 'Not saved yet'}</span>`;
  }
  updateSummary();
  Object.keys(POMODORO_LIMITS).forEach((key) => form.elements[key].addEventListener('input', () => {
    checkPomo(key, { allowEmpty: true });
    updateSummary();
  }));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const values = {};
    let firstBad = null;
    for (const key of Object.keys(POMODORO_LIMITS)) {
      values[key] = checkPomo(key);
      if (values[key] === null && !firstBad) firstBad = form.elements[key];
    }
    if (firstBad) return firstBad.focus();
    await setSetting('pomodoro', { ...(await getSetting('pomodoro')), ...values });
    saved = { ...saved, ...values };
    updateSummary();
    toast(`Pomodoro lengths saved: ${values.focus} min focus, ${values.short} min short break, ${values.long} min long break. The timer is updated straight away.`, 'success');
  });
  $('#pomo-default', page).addEventListener('click', () => {
    Object.entries({ focus: 25, short: 5, long: 15, cyclesBeforeLong: 4 }).forEach(([k, v]) => (form.elements[k].value = v));
    form.requestSubmit();
  });

  // Switches
  page.addEventListener('change', async (e) => {
    const key = e.target.dataset.switch;
    if (key === 'theme') {
      setTheme(e.target.checked ? 'dark' : 'light');
    } else if (key) {
      await setSetting('a11y', { ...(await getSetting('a11y')), [key]: e.target.checked });
    }
    if (e.target.id === 's-language') {
      await setSetting('language', e.target.value);
      toast('AI language saved.', 'success');
    }
  });
  const syncTheme = (ev) => {
    const box = page.querySelector('[data-switch="theme"]');
    if (box) box.checked = ev.detail === 'dark';
  };
  window.addEventListener('theme-changed', syncTheme);

  // AI usage: show today's count and let the student reset it.
  const showUsage = async () => {
    const left = await aiRequestsLeft();
    $('#s-ai-used', page).textContent = `${DAILY_LIMIT - left} of ${DAILY_LIMIT} used. ${PLAN.noticeLong}`;
    $('#s-ai-left', page).innerHTML = `${icon('sparkles')}${left} / ${DAILY_LIMIT} left today`;
  };
  showUsage();
  $('#s-ai-reset', page).addEventListener('click', async () => {
    await resetAiUsage();
    await showUsage();
    toast(`AI usage reset. You have ${DAILY_LIMIT} requests again today.`, 'success');
  });

  // Export
  $('#s-export', page).addEventListener('click', async (e) => {
    setLoading(e.currentTarget, true);
    const data = { app: 'learnpath', version: 1, exportedAt: new Date().toISOString(), stores: {} };
    for (const name of EXPORT_STORES) data.stores[name] = await getAll(name);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `learnpath-backup-${dateKey()}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setLoading(e.currentTarget, false);
    toast('Backup downloaded.', 'success');
  });

  // Import
  $('#s-import-file', page).addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    let data;
    try {
      data = JSON.parse(await file.text());
      if (data?.app !== 'learnpath' || typeof data.stores !== 'object') throw new Error('bad');
    } catch {
      toast('This is not a LearnPath backup file.', 'error');
      return;
    }
    const ok = await confirmModal({ title: 'Import this backup?', message: `Your current roadmaps, progress, sessions, blocks and quizzes will be replaced by the backup from ${String(data.exportedAt || 'an earlier date').slice(0, 10)}. PDFs already in this browser stay.`, confirmLabel: 'Import' });
    if (!ok) return;
    try {
      for (const name of EXPORT_STORES) {
        if (!Array.isArray(data.stores[name])) continue;
        await clear(name);
        await putMany(name, data.stores[name]);
      }
      clearSettingsCache();
      toast('Backup imported. Reloading...', 'success');
      setTimeout(() => location.reload(), 800);
    } catch (err) {
      console.error(err);
      toast('Import failed. The file may be damaged.', 'error');
    }
  });

  // Reset
  $('#s-reset', page).addEventListener('click', async () => {
    const ok = await confirmModal({ title: 'Reset all data?', message: 'This permanently deletes all roadmaps, PDFs, progress, sessions, blocks, quizzes and settings stored by LearnPath in this browser. Export a backup first if you want to keep it. This cannot be undone.', confirmLabel: 'Delete everything', danger: true });
    if (!ok) return;
    await clearAll();
    try {
      localStorage.removeItem('lp-pomodoro');
    } catch {
      /* ignore */
    }
    clearSettingsCache();
    toast('All data deleted. Reloading...', 'success');
    setTimeout(() => {
      location.hash = '#/dashboard';
      location.reload();
    }, 800);
  });

  return () => window.removeEventListener('theme-changed', syncTheme);
}

function numField(name, label, value, unit) {
  const { min, max } = POMODORO_LIMITS[name];
  return `<div class="field"><label class="label" for="pf-${name}">${label} <span class="label-hint">(${min}-${max}${unit ? ` ${unit}` : ''})</span></label>
    <input class="input" type="number" id="pf-${name}" name="${name}" min="${min}" max="${max}" step="1" value="${value}" required aria-describedby="pf-${name}-error">
    <span class="field-error" id="pf-${name}-error" hidden></span></div>`;
}

function switchRow(key, label, hint, checked) {
  return `<label class="switch setting-row">
    <span class="switch-text"><span class="small strong">${label}</span><span class="xs muted">${hint}</span></span>
    <input type="checkbox" data-switch="${key}" ${checked ? 'checked' : ''}>
    <span class="switch-track" aria-hidden="true"></span>
  </label>`;
}
