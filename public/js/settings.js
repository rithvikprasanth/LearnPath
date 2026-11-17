// settings.js: read/write settings (IndexedDB "settings" store) and apply
// the theme (localStorage) and accessibility options to the page.
import { get, put } from './db.js';

export const DEFAULTS = {
  pomodoro: { focus: 25, short: 5, long: 15, cyclesBeforeLong: 4, autoStart: false, sound: true, notify: false },
  language: 'en',
  a11y: { readableFont: false, largeText: false },
  aiUsage: { date: '', count: 0 },
};

// Allowed Pomodoro lengths (minutes), used by the Pomodoro page and Settings.
export const POMODORO_LIMITS = {
  focus: { min: 1, max: 120, label: 'Focus' },
  short: { min: 1, max: 60, label: 'Short break' },
  long: { min: 1, max: 60, label: 'Long break' },
  cyclesBeforeLong: { min: 2, max: 8, label: 'Sessions before a long break' },
};

export const LANGUAGE_OPTIONS = [
  ['en', 'English'],
  ['hi', 'Hindi (हिन्दी)'],
  ['ta', 'Tamil (தமிழ்)'],
  ['te', 'Telugu (తెలుగు)'],
  ['kn', 'Kannada (ಕನ್ನಡ)'],
  ['ml', 'Malayalam (മലയാളം)'],
  ['bn', 'Bengali (বাংলা)'],
  ['mr', 'Marathi (मराठी)'],
];

// Text-to-speech language tags for "Read aloud".
export const SPEECH_LANG = { en: 'en-IN', hi: 'hi-IN', ta: 'ta-IN', te: 'te-IN', kn: 'kn-IN', ml: 'ml-IN', bn: 'bn-IN', mr: 'mr-IN' };

const cache = {};

export async function getSetting(key) {
  if (key in cache) return cache[key];
  const row = await get('settings', key);
  const def = DEFAULTS[key];
  // Merge with defaults so new options get a value.
  const value = row ? (typeof def === 'object' && !Array.isArray(def) ? { ...def, ...row.value } : row.value) : structuredClone(def);
  cache[key] = value;
  return value;
}

export async function setSetting(key, value) {
  cache[key] = value;
  await put('settings', { key, value });
  window.dispatchEvent(new CustomEvent('settings-changed', { detail: { key, value } }));
}

export function clearSettingsCache() {
  Object.keys(cache).forEach((k) => delete cache[k]);
}

// ---------- theme (localStorage, so it applies before IndexedDB loads) ----------
export function getTheme() {
  try {
    return localStorage.getItem('lp-theme') === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem('lp-theme', theme);
  } catch {
    /* storage blocked: theme still applies for this visit */
  }
  window.dispatchEvent(new CustomEvent('theme-changed', { detail: theme }));
}

export async function applyA11y() {
  const a11y = await getSetting('a11y');
  document.documentElement.classList.toggle('font-readable', !!a11y.readableFont);
  document.documentElement.classList.toggle('text-large', !!a11y.largeText);
}
