// app.js: starts the app. Builds the sidebar, starts the Pomodoro engine and the router.
import { icon } from './icons.js';
import { startRouter } from './router.js';
import { initTimer, subscribe } from './timer.js';
import { getTheme, setTheme, applyA11y } from './settings.js';
import { aiRequestsLeft, DAILY_LIMIT } from './ai-client.js';
import { openDB } from './db.js';
import { formatClock, toast, $ } from './ui.js';

import * as dashboard from './pages/dashboard.js';
import * as roadmap from './pages/roadmap.js';
import * as pomodoro from './pages/pomodoro.js';
import * as blocks from './pages/blocks.js';
import * as materials from './pages/materials.js';
import * as viewer from './pages/viewer.js';
import * as settings from './pages/settings.js';

const NAV = [
  ['dashboard', 'Dashboard', 'dashboard'],
  ['roadmap', 'Roadmap', 'map'],
  ['pomodoro', 'Pomodoro', 'timer'],
  ['blocks', 'Focus Blocks', 'calendar'],
  ['materials', 'Study Material', 'book'],
  ['settings', 'Settings', 'settings'],
];

function renderNav() {
  $('#brand-mark').innerHTML = icon('logo');
  $('#nav').innerHTML = NAV.map(
    ([route, label, ic]) => `<a class="nav-link" href="#/${route}" data-route="${route}">${icon(ic)}<span>${label}</span></a>`
  ).join('');
}

function highlightNav(name) {
  const active = name === 'viewer' ? 'materials' : name;
  document.querySelectorAll('.nav-link').forEach((a) => {
    if (a.dataset.route === active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

function renderThemeButton() {
  const dark = getTheme() === 'dark';
  const btn = $('#theme-toggle');
  btn.innerHTML = `${icon(dark ? 'sun' : 'moon')}<span>${dark ? 'Light' : 'Dark'} theme</span>`;
  btn.setAttribute('aria-label', `Switch to ${dark ? 'light' : 'dark'} theme`);
}

async function renderQuota() {
  const left = await aiRequestsLeft();
  $('#ai-quota').innerHTML = `${icon('sparkles', 'sr-only')}${left} of ${DAILY_LIMIT} AI requests left today`;
}

// Small timer in the sidebar, visible while a session is running or paused.
function renderMiniTimer(t) {
  const el = $('#mini-timer');
  if (t.status === 'idle') {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.className = `mini-timer phase-${t.phase}`;
  el.innerHTML = `<span class="mini-timer-icon">${icon(t.status === 'running' ? 'timer' : 'pause')}</span>
    <span class="grow">${t.label}${t.status === 'paused' ? ' (paused)' : ''}</span>
    <span class="time">${formatClock(t.remaining)}</span>`;
  el.setAttribute('aria-label', `${t.label} ${formatClock(t.remaining)} remaining. Open Pomodoro`);
}

async function main() {
  try {
    await openDB();
  } catch (err) {
    $('#main').innerHTML = `<div class="page"><div class="alert alert-error" role="alert">LearnPath could not open its storage (IndexedDB). Private browsing mode can block it. Please use a normal window.</div></div>`;
    return;
  }

  renderNav();
  renderThemeButton();
  await applyA11y();
  $('#theme-toggle').addEventListener('click', () => setTheme(getTheme() === 'dark' ? 'light' : 'dark'));
  window.addEventListener('theme-changed', renderThemeButton);

  await initTimer();
  let lastStatus = '';
  subscribe((t) => {
    // Only redraw the sidebar timer when something visible changed.
    const key = `${t.status}|${t.phase}|${Math.ceil(t.remaining / 1000)}`;
    if (key !== lastStatus) {
      lastStatus = key;
      renderMiniTimer(t);
    }
  });
  window.addEventListener('pomodoro-phase-end', (e) => {
    const { finished, next, natural } = e.detail;
    if (!natural) return;
    if (finished === 'focus') toast(`Great work! Focus session logged. Next: ${next === 'long' ? 'long break' : 'short break'}.`, 'success');
    else toast('Break is over. Ready for the next focus session?', 'info');
  });

  renderQuota();
  window.addEventListener('ai-usage-changed', renderQuota);
  window.addEventListener('settings-changed', (e) => {
    if (e.detail.key === 'a11y') applyA11y();
    if (e.detail.key === 'aiUsage') renderQuota();
  });

  startRouter($('#main'), { dashboard, roadmap, pomodoro, blocks, materials, viewer, settings }, highlightNav);
}

main();
