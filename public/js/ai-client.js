// ai-client.js: the browser side of the AI.
// - Calls our own /api/ai (never OpenRouter directly; the key stays on the server)
// - Caches every answer in IndexedDB, so the same page + action + language is never sent twice
// - Limits each browser to DAILY_LIMIT requests per day (the free key is shared by everyone)
import { get, put } from './db.js';
import { getSetting, setSetting } from './settings.js';
import { dateKey } from './ui.js';

export const DAILY_LIMIT = 15;
const CLIENT_TIMEOUT_MS = 62000; // a little longer than the server's 60 s limit

// SHA-256 of a string as hex, used as a short cache key.
async function hash(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function getUsage() {
  const usage = await getSetting('aiUsage');
  return usage.date === dateKey() ? usage : { date: dateKey(), count: 0 };
}

export async function aiRequestsLeft() {
  const usage = await getUsage();
  return Math.max(0, DAILY_LIMIT - usage.count);
}

async function countRequest() {
  const usage = await getUsage();
  await setSetting('aiUsage', { date: usage.date, count: usage.count + 1 });
  window.dispatchEvent(new Event('ai-usage-changed'));
}

// Light checks on the browser side too (the server already validated the shape).
function looksValid(action, data) {
  if (!data) return false;
  if (action === 'roadmap') return Array.isArray(data.weeks) && data.weeks.length > 0 && data.weeks.every((w) => Array.isArray(w.topics) && w.topics.length);
  if (action === 'explain') return Array.isArray(data.bullets) && data.bullets.length > 0;
  if (action === 'quiz') return Array.isArray(data.questions) && data.questions.length > 0 && data.questions.every((q) => q.options?.length === 4 && Number.isInteger(q.correct));
  return false;
}

// Errors worth an automatic retry (the free AI was busy, slow or gave a bad answer).
export const RETRYABLE = ['rate_limited', 'timeout', 'upstream', 'bad_output', 'network'];

/**
 * Ask the AI. Returns { ok: true, data, cached } or { ok: false, error, message }.
 * It never throws, so callers can always show a friendly message.
 * `isRetry: true` = an automatic retry of the same click, so it does not count toward the daily limit.
 */
export async function askAI(action, input, language, { isRetry = false } = {}) {
  language = language || (await getSetting('language'));
  const key = `${action}|${language}|${await hash(input)}`;

  // 1. Cache: same request answered before? Use it (free and instant).
  const cached = await get('ai_cache', key);
  if (cached) return { ok: true, data: cached.data, cached: true };

  // 2. Daily limit for this browser.
  if (!isRetry && (await aiRequestsLeft()) <= 0) {
    return { ok: false, error: 'daily_limit', message: `You have used all ${DAILY_LIMIT} AI requests for today. They reset tomorrow. Everything else still works.` };
  }

  // 3. Call our server function.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
  try {
    const response = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, language, input }),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null);

    // Requests that reached the AI service count toward today's limit.
    if (!isRetry && (!body || !['bad_request', 'no_key'].includes(body.error))) await countRequest();

    if (!body && response.status === 504) return { ok: false, error: 'timeout', message: 'The free AI took too long to answer. Please try again; it is often faster the second time.' };
    if (!body) return { ok: false, error: 'network', message: 'Could not reach the AI service. Check your internet connection.' };
    if (!body.ok) return { ok: false, error: body.error, message: body.message || 'The AI could not answer right now.' };
    if (!looksValid(action, body.data)) return { ok: false, error: 'bad_output', message: 'The AI gave an answer we could not read. Please try again.' };

    await put('ai_cache', { key, action, language, data: body.data, createdAt: Date.now() });
    return { ok: true, data: body.data, cached: false, model: body.model };
  } catch (err) {
    const timedOut = err.name === 'AbortError';
    return { ok: false, error: timedOut ? 'timeout' : 'network', message: timedOut ? 'The AI took too long to answer. Please try again.' : 'Could not reach the AI service. Check your internet connection.' };
  } finally {
    clearTimeout(timer);
  }
}
