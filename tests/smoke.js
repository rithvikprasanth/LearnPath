// Quick smoke test for /api/ai (no real AI calls, no test framework).
// Run with: npm run smoke
import handler from '../api/ai.js';

// A fake request/response pair that looks like what Vercel and dev-server.js pass in.
async function call(method, body, env = {}) {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k];
  const res = {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(k, v) { this.headers[k] = v; },
    end(text) { this.body = text; },
    headersSent: false,
  };
  await handler({ method, body }, res);
  process.env = saved;
  return { status: res.statusCode, json: JSON.parse(res.body) };
}

let failed = 0;
function check(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  -> ' + JSON.stringify(detail)}`);
  if (!cond) failed++;
}

const noKey = { OPENROUTER_API_KEY: undefined, AI_MOCK: undefined };

let r = await call('GET', null);
check('GET is rejected (405)', r.status === 405, r);

r = await call('POST', { action: 'chat', language: 'en', input: 'hi' }, noKey);
check('unknown action is rejected (400)', r.status === 400 && r.json.error === 'bad_request', r);

r = await call('POST', { action: 'explain', language: 'fr', input: 'hi' }, noKey);
check('unsupported language is rejected (400)', r.status === 400, r);

r = await call('POST', { action: 'explain', language: 'en', input: 'x'.repeat(4001) }, noKey);
check('input over 4000 chars is rejected (400)', r.status === 400 && /too long/.test(r.json.message), r);

r = await call('POST', { action: 'explain', language: 'en', input: '   ' }, noKey);
check('empty input is rejected (400)', r.status === 400, r);

r = await call('POST', '{not json', noKey);
check('invalid JSON is rejected (400)', r.status === 400, r);

r = await call('POST', { action: 'explain', language: 'en', input: 'Some page text' }, noKey);
check('missing key gives a friendly no_key error (500)', r.status === 500 && r.json.error === 'no_key', r);

for (const action of ['roadmap', 'explain', 'quiz']) {
  r = await call('POST', { action, language: 'hi', input: 'Some text' }, { AI_MOCK: '1' });
  check(`mock ${action} returns ok`, r.status === 200 && r.json.ok && r.json.data, r);
}

console.log(failed ? `\n${failed} check(s) failed` : '\nAll smoke checks passed');
process.exit(failed ? 1 : 0);
