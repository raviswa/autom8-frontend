/**
 * Static SPA server with anti-scrape headers + known bot / AI-crawler blocks.
 * Replaces `serve -s` for Railway so we can set X-Robots-Tag and UA filters.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', 'dist');
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

/** Substrings matched against lowercase User-Agent (AI crawlers + scrapers). */
const BLOCKED_UA = [
  'gptbot',
  'chatgpt-user',
  'oai-searchbot',
  'claudebot',
  'claude-web',
  'anthropic-ai',
  'ccbot',
  'google-extended',
  'bytespider',
  'amazonbot',
  'applebot-extended',
  'cohere-ai',
  'diffbot',
  'imagesiftbot',
  'omgilibot',
  'perplexitybot',
  'youbot',
  'facebookbot',
  'meta-externalagent',
  'scrapy',
  'python-requests',
  'python-urllib',
  'aiohttp',
  'httpx',
  'libwww-perl',
  'go-http-client',
  'phantomjs',
  'httrack',
  'sitesucker',
  'dataforseo',
  'semrush',
  'ahrefs',
  'mj12bot',
  'dotbot',
  'petalbot',
  'ia_archiver',
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

function setSecurityHeaders(res) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noimageindex');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}

function isBlockedUa(ua) {
  const s = String(ua || '').toLowerCase();
  if (!s) return false;
  return BLOCKED_UA.some((frag) => s.includes(frag));
}

function safeJoin(root, urlPath) {
  const decoded = decodeURIComponent((urlPath || '/').split('?')[0].split('#')[0]);
  const joined = path.normalize(path.join(root, decoded));
  if (!joined.startsWith(root)) return null;
  return joined;
}

function sendFile(req, res, filePath, statusCode = 200) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  res.setHeader('Content-Type', type);
  if (ext === '.html' || ext === '.txt') {
    res.setHeader('Cache-Control', 'no-store');
  } else if (ext === '.js' || ext === '.css' || ext === '.woff2' || ext === '.woff') {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  } else {
    res.setHeader('Cache-Control', 'no-store');
  }
  res.writeHead(statusCode);
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer((req, res) => {
  setSecurityHeaders(res);

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    res.end('Method Not Allowed');
    return;
  }

  if (isBlockedUa(req.headers['user-agent'])) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  let urlPath = req.url || '/';
  if (urlPath === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  let filePath = safeJoin(ROOT, urlPath === '/' ? '/index.html' : urlPath);
  if (!filePath) {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }

  fs.stat(filePath, (err, st) => {
    if (!err && st.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
    fs.stat(filePath, (err2, st2) => {
      if (!err2 && st2.isFile()) {
        return sendFile(req, res, filePath, 200);
      }
      // SPA fallback
      const index = path.join(ROOT, 'index.html');
      fs.stat(index, (err3, st3) => {
        if (err3 || !st3.isFile()) {
          res.writeHead(404);
          res.end('Not Found');
          return;
        }
        sendFile(req, res, index, 200);
      });
    });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[serve-protected] ${HOST}:${PORT} → ${ROOT}`);
});
