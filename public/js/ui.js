// ui.js: the reusable components (modal, toast, progress bar, ring, empty state)
// plus small helpers. Every page builds its UI from these.
import { icon } from './icons.js';

// ---------- helpers ----------

// Escape text before putting it into HTML (prevents broken markup and injected HTML).
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const clampPct = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));

// Local date as "YYYY-MM-DD" (not UTC, so "today" matches the student's clock).
export function dateKey(date = new Date()) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatMinutes(min) {
  const m = Math.round(min || 0);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

// "mm:ss" for the timer.
export function formatClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function formatBytes(bytes) {
  if (!bytes) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Show a spinner on a button while something async runs.
export function setLoading(button, loading) {
  if (!button) return;
  button.classList.toggle('is-loading', loading);
  button.disabled = loading;
  button.setAttribute('aria-busy', String(loading));
}

// ---------- toast ----------
const TOAST_ICON = { info: 'info', success: 'checkCircle', warning: 'alert', error: 'alert' };

export function toast(message, type = 'info', ms = 4500) {
  let region = $('#toast-region');
  if (!region) {
    region = document.createElement('div');
    region.id = 'toast-region';
    region.className = 'toast-region';
    region.setAttribute('aria-live', 'polite');
    document.body.append(region);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.innerHTML = `${icon(TOAST_ICON[type] || 'info')}<div class="grow">${esc(message)}</div>
    <button class="btn btn-ghost btn-icon btn-sm" aria-label="Dismiss">${icon('x')}</button>`;
  const remove = () => {
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 250);
  };
  el.querySelector('button').addEventListener('click', remove);
  region.append(el);
  setTimeout(remove, ms);
}

// ---------- modal (one reusable dialog) ----------
// openModal({ title, body: htmlString, actions: [{ label, variant, value }], wide })
// returns { el, close } and a promise `result` that resolves with the clicked action's value.
export function openModal({ title, body = '', actions = [], wide = false, onOpen } = {}) {
  const previousFocus = document.activeElement;
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  const titleId = 'modal-title-' + Date.now();
  backdrop.innerHTML = `
    <div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="${titleId}">
      <div class="modal-header">
        <h2 id="${titleId}">${esc(title)}</h2>
        <button class="btn btn-ghost btn-icon btn-sm" data-close aria-label="Close">${icon('x')}</button>
      </div>
      <div class="modal-body">${body}</div>
      ${actions.length ? `<div class="modal-footer">${actions
        .map((a, i) => `<button class="btn btn-${a.variant || 'secondary'}" data-action="${i}" ${a.type === 'submit' ? 'type="submit"' : 'type="button"'}>${esc(a.label)}</button>`)
        .join('')}</div>` : ''}
    </div>`;

  let resolveResult;
  const result = new Promise((r) => (resolveResult = r));

  function close(value = null) {
    document.removeEventListener('keydown', onKey, true);
    backdrop.remove();
    resolveResult(value);
    if (previousFocus && previousFocus.focus) previousFocus.focus();
  }

  // Keep keyboard focus inside the dialog; Escape closes it.
  function onKey(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close(null);
    } else if (e.key === 'Tab') {
      const focusable = $$('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', backdrop)
        .filter((n) => !n.disabled && n.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  backdrop.addEventListener('mousedown', (e) => {
    if (e.target === backdrop) close(null);
  });
  backdrop.querySelector('[data-close]').addEventListener('click', () => close(null));
  backdrop.querySelectorAll('[data-action]').forEach((btn) => {
    const action = actions[Number(btn.dataset.action)];
    btn.addEventListener('click', async () => {
      if (action.onClick) {
        const keepOpen = await action.onClick(btn, backdrop);
        if (keepOpen === false) return; // handler asked to keep the dialog open
      }
      close(action.value ?? action.label);
    });
  });
  document.addEventListener('keydown', onKey, true);
  document.body.append(backdrop);

  const firstField = backdrop.querySelector('input, select, textarea') || backdrop.querySelector('[data-action]') || backdrop.querySelector('[data-close]');
  firstField?.focus();
  onOpen?.(backdrop);
  return { el: backdrop, close, result };
}

// Yes/no confirm dialog. Resolves true or false.
export async function confirmModal({ title, message, confirmLabel = 'Confirm', danger = false }) {
  const { result } = openModal({
    title,
    body: `<p>${esc(message)}</p>`,
    actions: [
      { label: 'Cancel', variant: 'secondary', value: false },
      { label: confirmLabel, variant: danger ? 'danger' : 'primary', value: true },
    ],
  });
  return (await result) === true;
}

// ---------- progress bar ----------
export function progressBar({ label = '', percent = 0, small = false, showValue = true } = {}) {
  const p = clampPct(percent);
  return `<div class="progress ${small ? 'progress-sm' : ''}">
    ${label || showValue ? `<div class="progress-head"><span>${esc(label)}</span>${showValue ? `<span class="value">${p}%</span>` : ''}</div>` : ''}
    <div class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p}" aria-label="${esc(label || 'Progress')}">
      <div class="progress-fill ${p >= 100 ? 'is-done' : ''}" style="width:${p}%"></div>
    </div>
  </div>`;
}

// ---------- progress ring (SVG stroke-dashoffset trick) ----------
// The circle's dash length equals its circumference; shifting the dash (offset)
// hides part of the stroke, so offset = circumference * (1 - percent/100).
export function ring({ size = 200, stroke = 14, percent = 0, center = '', className = '', label = 'Progress' } = {}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - clampPct(percent) / 100);
  return `<div class="ring ${className}" style="width:${size}px;height:${size}px" role="img" aria-label="${esc(label)}">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle class="ring-track" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}"/>
      <circle class="ring-fill" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}"
        stroke-dasharray="${c}" stroke-dashoffset="${offset}" data-c="${c}"/>
    </svg>
    <div class="ring-center">${center}</div>
  </div>`;
}

// Update an existing ring without re-rendering. `fraction` is 0..1 (not rounded, for smooth timers).
export function setRing(ringEl, fraction) {
  const fill = ringEl?.querySelector('.ring-fill');
  if (!fill) return;
  const c = Number(fill.dataset.c);
  const f = Math.max(0, Math.min(1, fraction));
  fill.setAttribute('stroke-dashoffset', String(c * (1 - f)));
}

// ---------- empty state ----------
export function emptyState({ iconName = 'info', title, text = '', action = '' }) {
  return `<div class="empty">
    <div class="empty-icon">${icon(iconName)}</div>
    <h3>${esc(title)}</h3>
    ${text ? `<p>${esc(text)}</p>` : ''}
    ${action}
  </div>`;
}

// Skeleton placeholder while data loads.
export function skeleton(lines = 3) {
  return `<div class="stack-sm" aria-hidden="true">${'<div class="skeleton skeleton-line"></div>'.repeat(lines)}</div>`;
}

export function alertBox(message, type = 'info') {
  const ic = type === 'success' ? 'checkCircle' : type === 'info' ? 'info' : 'alert';
  return `<div class="alert alert-${type}" role="${type === 'error' ? 'alert' : 'status'}">${icon(ic)}<div>${esc(message)}</div></div>`;
}
