// POST /api/ai: the ONLY server code in LearnPath (a Vercel serverless function).
// The browser sends { action, language, input }. We add the secret OpenRouter key here,
// call a free model, check the answer has the right shape, and send back clean JSON.
// This is NOT a general proxy: only "roadmap", "explain" and "quiz" are allowed.
import { buildMessages, LANGUAGES, RETRY_REMINDER } from './prompts.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const ACTIONS = ['roadmap', 'explain', 'quiz'];
const MAX_INPUT = 4000;
const TIME_BUDGET_MS = 55000; // the function may run 60 s (vercel.json); stop the AI call at 55 s

// ---------- small helpers ----------
function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function fail(res, status, error, message) {
  send(res, status, { ok: false, error, message });
}

// Models come from the OPENROUTER_MODELS env var (comma-separated, in order of preference).
// Only FREE models are allowed: ids ending in ":free" (or the "openrouter/free" router).
// We do not add "openrouter/free" automatically: in testing it picked tiny models that
// returned empty answers, so it is only used if you list it yourself.
function getModels() {
  const list = (process.env.OPENROUTER_MODELS || '')
    .split(',')
    .map((m) => m.trim())
    .filter((m) => m.endsWith(':free') || m === 'openrouter/free');
  return list.length ? list.slice(0, 3) : ['openrouter/free'];
}

// Pull a JSON object out of a model reply (models sometimes add ```json fences or text).
function extractJson(text) {
  if (typeof text !== 'string') return null;
  const cleaned = text.replace(/```(?:json)?/gi, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

const str = (v, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// ---------- validators: return clean data, or null if the shape is wrong ----------
function validateRoadmap(obj) {
  if (!obj || !Array.isArray(obj.weeks) || obj.weeks.length === 0) return null;
  const weeks = [];
  obj.weeks.slice(0, 52).forEach((w, i) => {
    if (!w || !Array.isArray(w.topics)) return;
    const topics = w.topics
      .filter((t) => t && str(t.title))
      .slice(0, 8)
      .map((t) => ({
        title: str(t.title, 120),
        description: str(t.description, 300),
        estHours: Math.min(40, Math.max(0.5, Number(t.estHours) || 1)),
      }));
    if (topics.length) {
      weeks.push({ week: weeks.length + 1, title: str(w.title, 120) || `Week ${i + 1}`, focus: str(w.focus, 300), topics });
    }
  });
  if (!weeks.length) return null;
  return { title: str(obj.title, 120) || 'My study roadmap', weeks };
}

function validateExplain(text) {
  if (typeof text !== 'string') return null;
  const bullets = text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter((line) => line.length > 2 && !/^```/.test(line))
    .slice(0, 6)
    .map((line) => line.slice(0, 400));
  return bullets.length >= 2 ? { bullets } : null;
}

function validateQuiz(obj) {
  if (!obj || !Array.isArray(obj.questions)) return null;
  const questions = obj.questions
    .map((q) => {
      if (!q || !str(q.question) || !Array.isArray(q.options) || q.options.length !== 4) return null;
      const options = q.options.map((o) => str(String(o ?? ''), 200));
      if (options.some((o) => !o)) return null;
      let correct = q.correct;
      if (typeof correct === 'string' && /^[A-Da-d]$/.test(correct.trim())) {
        correct = correct.trim().toUpperCase().charCodeAt(0) - 65; // "B" -> 1
      }
      correct = Number(correct);
      if (!Number.isInteger(correct) || correct < 0 || correct > 3) return null;
      return { question: str(q.question, 300), options, correct, explanation: str(q.explanation, 300) };
    })
    .filter(Boolean)
    .slice(0, 3);
  return questions.length >= 2 ? { questions } : null;
}

function parseReply(action, text, model) {
  let data;
  if (action === 'roadmap') data = validateRoadmap(extractJson(text));
  else if (action === 'quiz') data = validateQuiz(extractJson(text));
  else data = validateExplain(text);
  // Log unreadable replies (model name + length only, never the key) to help debugging.
  if (!data) console.error(`[api/ai] unreadable ${action} reply from ${model}: ${String(text || '').length} chars`);
  return data;
}

// ---------- mock mode (local testing only: set AI_MOCK=1 in .env) ----------
function mockData(action) {
  if (action === 'roadmap') {
    return {
      title: 'Mock roadmap',
      weeks: [
        { week: 1, title: 'Basics', focus: 'Mock focus', topics: [{ title: 'Topic A', description: 'Mock', estHours: 2 }, { title: 'Topic B', description: 'Mock', estHours: 2 }] },
        { week: 2, title: 'Practice', focus: 'Mock focus', topics: [{ title: 'Topic C', description: 'Mock', estHours: 4 }] },
      ],
    };
  }
  if (action === 'explain') return { bullets: ['Mock point one.', 'Mock point two.', 'Mock point three.'] };
  return {
    questions: [0, 1, 2].map((i) => ({ question: `Mock question ${i + 1}?`, options: ['A', 'B', 'C', 'D'], correct: i, explanation: 'Mock.' })),
  };
}

// ---------- the OpenRouter call ----------
async function callOpenRouter(messages, models, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'X-Title': 'LearnPath',
      },
      body: JSON.stringify({
        model: models[0],
        models, // fallback list: if one model is busy, OpenRouter tries the next
        messages,
        temperature: 0.4,
        max_tokens: 6000, // enough for a 24-week plan
        // Turn off "thinking": it doubled the time and used up the token budget, which cut
        // long roadmaps off mid-JSON. (Docs: openrouter.ai/docs -> Reasoning Tokens.)
        // Only use models whose reasoning is NOT mandatory (see README).
        reasoning: { enabled: false },
      }),
    });
    const data = await response.json().catch(() => ({}));
    const errCode = data?.error?.code;
    if (response.status === 429 || errCode === 429) return { error: 'rate_limited' };
    if (!response.ok || data.error) {
      console.error('[api/ai] OpenRouter error', response.status, data?.error?.message || '');
      return { error: 'upstream' };
    }
    return { text: data?.choices?.[0]?.message?.content || '', model: data.model || models[0] };
  } catch (err) {
    if (err.name === 'AbortError') return { error: 'timeout' };
    console.error('[api/ai] fetch failed:', err.message);
    return { error: 'upstream' };
  } finally {
    clearTimeout(timer);
  }
}

const FRIENDLY = {
  rate_limited: 'The free AI is busy right now (rate limit reached). Please try again in a minute.',
  timeout: 'The free AI took too long to answer. Please try again.',
  upstream: 'The AI service had a problem. Please try again in a moment.',
  bad_output: 'The AI gave an answer we could not read. Please try again.',
};
const STATUS = { rate_limited: 429, timeout: 504, upstream: 502, bad_output: 502 };

// ---------- handler (works on Vercel and in dev-server.js) ----------
export default async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'method_not_allowed', 'Use POST.');

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return fail(res, 400, 'bad_request', 'The request was not valid JSON.');
  }
  const { action, language = 'en', input } = body || {};

  if (!ACTIONS.includes(action)) return fail(res, 400, 'bad_request', 'Unknown action.');
  if (!Object.hasOwn(LANGUAGES, language)) return fail(res, 400, 'bad_request', 'Unsupported language.');
  if (typeof input !== 'string' || !input.trim()) return fail(res, 400, 'bad_request', 'Input is empty.');
  if (input.length > MAX_INPUT) return fail(res, 400, 'bad_request', `Input is too long (max ${MAX_INPUT} characters).`);

  if (process.env.AI_MOCK === '1') {
    return send(res, 200, { ok: true, action, model: 'mock', data: mockData(action) });
  }
  if (!process.env.OPENROUTER_API_KEY) {
    return fail(res, 500, 'no_key', 'The AI is not set up yet (the server has no OpenRouter key).');
  }

  const started = Date.now();
  const models = getModels();
  const messages = buildMessages(action, language, input.trim());

  // First try.
  let result = await callOpenRouter(messages, models, TIME_BUDGET_MS);
  if (result.error) return fail(res, STATUS[result.error], result.error, FRIENDLY[result.error]);
  let data = parseReply(action, result.text, result.model);

  // Retry once if the shape was wrong (and there is time left).
  const left = TIME_BUDGET_MS - (Date.now() - started);
  if (!data && left > 15000) {
    const retryMessages = [...messages, { role: 'assistant', content: result.text.slice(0, 6000) }, { role: 'user', content: RETRY_REMINDER }];
    result = await callOpenRouter(retryMessages, models, left);
    if (result.error) return fail(res, STATUS[result.error], result.error, FRIENDLY[result.error]);
    data = parseReply(action, result.text, result.model);
  }

  if (!data) return fail(res, 502, 'bad_output', FRIENDLY.bad_output);
  return send(res, 200, { ok: true, action, model: result.model, data });
}
