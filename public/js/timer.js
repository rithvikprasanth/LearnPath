// timer.js: the Pomodoro engine (runs app-wide, independent of which page is open).
// Drift-proof: we store the END time (endsAt) and compute remaining = endsAt - Date.now().
// We never count setInterval ticks, so a sleeping tab or a refresh can't make it wrong.
// The running state is saved in localStorage so it survives page refreshes.
import { put, get, uid } from './db.js';
import { getSetting, DEFAULTS } from './settings.js';

const KEY = 'lp-pomodoro';
const PHASE_LABEL = { focus: 'Focus', short: 'Short break', long: 'Long break' };
export { PHASE_LABEL };

let settings = { ...DEFAULTS.pomodoro };
let state = null;
const listeners = new Set();
let audioCtx = null;

function freshState(keep = {}) {
  return {
    phase: 'focus',
    status: 'idle', // idle | running | paused
    endsAt: null, // timestamp (ms) when running
    remainingMs: settings.focus * 60000, // used when idle or paused
    lengthMs: settings.focus * 60000, // full length of the current phase
    startedAt: null, // when this focus session first started
    cycle: 0, // completed focus sessions
    topicId: keep.topicId || null,
    pathId: keep.pathId || null,
    blockId: null,
  };
}

function durationFor(phase) {
  return (phase === 'focus' ? settings.focus : phase === 'short' ? settings.short : settings.long) * 60000;
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage blocked: the timer still works until the page closes */
  }
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    return s && s.phase ? s : null;
  } catch {
    return null;
  }
}

// Time left in the current phase (ms).
export function remainingMs() {
  if (!state) return 0;
  return state.status === 'running' ? Math.max(0, state.endsAt - Date.now()) : state.remainingMs;
}

// A snapshot for the UI.
export function getTimer() {
  const duration = state.lengthMs || durationFor(state.phase);
  return {
    ...state,
    label: PHASE_LABEL[state.phase],
    remaining: remainingMs(),
    duration,
    fraction: duration ? remainingMs() / duration : 0,
    cyclesBeforeLong: settings.cyclesBeforeLong,
    settings,
  };
}

export function subscribe(fn) {
  listeners.add(fn);
  fn(getTimer());
  return () => listeners.delete(fn);
}

function emit() {
  const snap = getTimer();
  listeners.forEach((fn) => fn(snap));
  // Show the countdown in the tab title while running.
  const base = 'LearnPath';
  if (snap.status === 'running') {
    const total = Math.ceil(snap.remaining / 1000);
    document.title = `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')} ${snap.label} | ${base}`;
  } else if (document.title !== base) {
    document.title = base;
  }
}

// ---------- controls ----------
export function start() {
  if (state.status === 'running') return;
  unlockAudio();
  if (state.status === 'idle') state.startedAt = Date.now();
  state.endsAt = Date.now() + state.remainingMs;
  state.status = 'running';
  save();
  emit();
}

export function pause() {
  if (state.status !== 'running') return;
  state.remainingMs = Math.max(0, state.endsAt - Date.now());
  state.endsAt = null;
  state.status = 'paused';
  save();
  emit();
}

export function toggle() {
  if (state.status === 'running') pause();
  else start();
}

export function skip() {
  completePhase(false);
}

export function reset() {
  state = freshState(state);
  save();
  emit();
}

// Link the timer to a roadmap topic (and optionally a focus block).
export function setTopic(topicId, pathId = null, blockId = null) {
  state.topicId = topicId || null;
  state.pathId = pathId || null;
  state.blockId = blockId || null;
  save();
  emit();
}

// Start a fresh focus session for a topic (used by "Study" buttons and focus blocks).
export function startFocusFor(topicId, pathId, blockId = null, minutes = null) {
  state = freshState({ topicId, pathId });
  state.blockId = blockId;
  if (minutes) state.remainingMs = state.lengthMs = minutes * 60000;
  save();
  start();
}

// ---------- phase end ----------
let completing = false; // guard: the 250 ms check must not finish the same phase twice

async function completePhase(natural, endTime = Date.now()) {
  if (completing) return;
  completing = true;
  const finished = state.phase;
  const duration = state.lengthMs || durationFor(finished);
  const left = state.status === 'running' ? Math.max(0, state.endsAt - endTime) : state.remainingMs;
  const session = {
    id: uid(),
    topicId: state.topicId,
    pathId: state.pathId,
    blockId: state.blockId,
    phase: 'focus',
    startedAt: state.startedAt,
    endedAt: endTime,
    minutes: Math.round(((natural ? duration : duration - left) / 60000) * 10) / 10,
    completed: natural,
  };

  if (finished === 'focus') {
    if (natural) state.cycle += 1;
    state.blockId = null;
  }

  let next;
  if (finished === 'focus') {
    next = natural && state.cycle > 0 && state.cycle % settings.cyclesBeforeLong === 0 ? 'long' : 'short';
  } else {
    next = 'focus';
  }

  state.phase = next;
  state.remainingMs = state.lengthMs = durationFor(next);
  state.startedAt = null;
  state.endsAt = null;
  state.status = 'idle';
  if (settings.autoStart) {
    state.status = 'running';
    state.startedAt = Date.now();
    state.endsAt = Date.now() + state.remainingMs;
  }
  save();
  completing = false;

  // Log the focus session (only if at least 1 minute was studied) and finish a linked focus block.
  try {
    if (finished === 'focus' && session.startedAt && session.minutes >= 1) {
      await put('pomodoro_sessions', session);
      if (natural && session.blockId) {
        const block = await get('focus_blocks', session.blockId);
        if (block) await put('focus_blocks', { ...block, status: 'done' });
      }
    }
  } catch (err) {
    console.error('Could not save the focus session', err);
  }

  if (natural) announce(finished, next);
  window.dispatchEvent(new CustomEvent('pomodoro-phase-end', { detail: { finished, next, natural } }));
  emit();
}

// ---------- sound + notification ----------
function unlockAudio() {
  // Browsers only allow sound after a click, so we create the audio context on Start.
  if (!audioCtx && window.AudioContext) {
    try {
      audioCtx = new AudioContext();
    } catch {
      audioCtx = null;
    }
  }
}

function chime() {
  if (!settings.sound || !audioCtx) return;
  const now = audioCtx.currentTime;
  [660, 880, 990].forEach((freq, i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now + i * 0.18);
    gain.gain.exponentialRampToValueAtTime(0.25, now + i * 0.18 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 0.5);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now + i * 0.18);
    osc.stop(now + i * 0.18 + 0.55);
  });
}

function announce(finished, next) {
  chime();
  const text = finished === 'focus' ? `Focus session done. Time for a ${PHASE_LABEL[next].toLowerCase()}.` : 'Break over. Ready to focus?';
  if (settings.notify && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification('LearnPath', { body: text, tag: 'learnpath-pomodoro' });
    } catch {
      /* some browsers only allow notifications from a service worker */
    }
  }
}

// ---------- start-up ----------
let ticking = null;

function check() {
  if (state.status === 'running' && Date.now() >= state.endsAt) {
    completePhase(true, state.endsAt);
  } else {
    emit();
  }
}

export async function initTimer() {
  settings = await getSetting('pomodoro');
  state = load() || freshState();
  // If the settings changed while idle, use the new duration.
  if (state.status === 'idle') state.remainingMs = state.lengthMs = durationFor(state.phase);
  check(); // catch up if the phase ended while the tab was closed
  clearInterval(ticking);
  ticking = setInterval(check, 250);
  document.addEventListener('visibilitychange', check);
  window.addEventListener('settings-changed', (e) => {
    if (e.detail.key !== 'pomodoro') return;
    settings = e.detail.value;
    if (state.status === 'idle') state.remainingMs = state.lengthMs = durationFor(state.phase);
    save();
    emit();
  });
}
