// Tiny local development server (no framework needed).
// - Serves the static files in /public
// - Sends POST /api/ai to the same handler file Vercel uses (api/ai.js)
// - Loads OPENROUTER_API_KEY and OPENROUTER_MODELS from .env
// Run with: npm run dev   then open http://localhost:3000
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const publicDir = join(root, 'public');
const PORT = Number(process.env.PORT) || 3000;

// --- Load .env (simple KEY=VALUE lines; lines starting with # are comments) ---
const envFile = join(root, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match && !line.trim().startsWith('#') && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.pdf': 'application/pdf',
};

// Read the request body (max 32 KB, the AI function only needs a few KB).
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 32 * 1024) {
        reject(new Error('Body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function handleApi(req, res) {
  try {
    const raw = await readBody(req);
    try {
      req.body = raw ? JSON.parse(raw) : {};
    } catch {
      req.body = raw; // the handler reports invalid JSON itself
    }
    // Import the handler fresh each time so edits show up without a restart.
    const url = pathToFileURL(join(root, 'api', 'ai.js')).href + '?t=' + Date.now();
    const { default: handler } = await import(url);
    await handler(req, res);
  } catch (err) {
    console.error('[dev-server] API error:', err.message);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
    }
    res.end(JSON.stringify({ ok: false, error: 'server_error', message: 'Something went wrong on the server.' }));
  }
}

async function handleStatic(req, res) {
  let path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (path === '/') path = '/index.html';
  const file = normalize(join(publicDir, path));
  // Block "../" tricks that try to leave /public.
  if (!file.startsWith(publicDir)) {
    res.statusCode = 403;
    return res.end('Forbidden');
  }
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error('not a file');
    res.setHeader('Content-Type', MIME[extname(file).toLowerCase()] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache'); // always pick up edits during development
    res.end(await readFile(file));
  } catch {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Not found');
  }
}

const server = http.createServer((req, res) => {
  if (req.url.split('?')[0] === '/api/ai') {
    if (req.method === 'POST') return handleApi(req, res);
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    return res.end(JSON.stringify({ ok: false, error: 'method_not_allowed' }));
  }
  return handleStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`LearnPath dev server running at http://localhost:${PORT}`);
  console.log(process.env.OPENROUTER_API_KEY ? 'OpenRouter key: loaded from .env' : 'OpenRouter key: NOT set (AI uses fallbacks)');
});
