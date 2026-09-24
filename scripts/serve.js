'use strict';
// Static server for the coverage map. Used both locally and as the Railway
// process (`npm start` -> `node scripts/serve.js`).
//
// The page fetches data/*.json, which file:// blocks, so a real HTTP origin is
// the only way to see it work.
//
//   node scripts/serve.js [port]      port also read from $PORT (Railway sets it)
//
// data/map-uae.json is 8 MB and data/map.json 6 MB, so responses are gzipped
// when the client accepts it. Without that every page load ships ~15 MB.
//
// The map is NOT public data - it carries client names and HubSpot links. Set
// BASIC_AUTH_USER and BASIC_AUTH_PASS to put the whole site behind a password.
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || process.env.PORT || 8099);
const HOST = process.env.HOST || '0.0.0.0';

const USER = process.env.BASIC_AUTH_USER || '';
const PASS = process.env.BASIC_AUTH_PASS || '';
const AUTH = USER && PASS ? 'Basic ' + Buffer.from(USER + ':' + PASS).toString('base64') : '';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};
// Compressing an already-compressed image wastes CPU and gains nothing.
const COMPRESSIBLE = /^(text\/|application\/(json|javascript)|image\/svg)/;

// Timing-safe compare so a wrong password cannot be found byte by byte.
function authOk(header) {
  if (!AUTH) return true;
  const got = Buffer.from(String(header || ''));
  const want = Buffer.from(AUTH);
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Allow': 'GET, HEAD' }); res.end(); return;
  }

  let p;
  try { p = decodeURIComponent(req.url.split('?')[0]); }
  catch { res.writeHead(400, { 'Content-Type': 'text/plain' }); res.end('bad request'); return; }

  // Railway's health check, before auth so a password does not fail the deploy.
  if (p === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok'); return;
  }

  if (!authOk(req.headers.authorization)) {
    res.writeHead(401, {
      'WWW-Authenticate': 'Basic realm="FlapKap Coverage Map", charset="UTF-8"',
      'Content-Type': 'text/plain',
    });
    res.end('unauthorized'); return;
  }

  if (p === '/') p = '/page/index.html';
  // data/ is fetched by the page at its own path; dist/ holds the single-file
  // build (open /dist/flapkap-uae-map.html to check it before publishing);
  // everything else lives in page/.
  if (!p.startsWith('/data/') && !p.startsWith('/page/') && !p.startsWith('/dist/')) p = '/page' + p;

  const file = path.join(ROOT, p);
  // path.join normalises '..', so this catches any attempt to escape ROOT.
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' }); res.end('forbidden'); return;
  }

  let stat;
  try { stat = fs.statSync(file); } catch { stat = null; }
  if (!stat || stat.isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found: ' + p); return;
  }

  const type = TYPES[path.extname(file)] || 'application/octet-stream';
  // The data files are rebuilt by the scripts, so the page must not be served a
  // stale copy: revalidate HTML and JSON, cache the vendor CSS hard.
  const cache = p.startsWith('/page/vendor/')
    ? 'public, max-age=604800'
    : 'public, max-age=0, must-revalidate';
  const etag = '"' + stat.size.toString(16) + '-' + stat.mtimeMs.toString(16) + '"';

  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { 'ETag': etag, 'Cache-Control': cache }); res.end(); return;
  }

  const headers = {
    'Content-Type': type,
    'Cache-Control': cache,
    'ETag': etag,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  };

  const gzip = COMPRESSIBLE.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  if (gzip) { headers['Content-Encoding'] = 'gzip'; headers['Vary'] = 'Accept-Encoding'; }
  else headers['Content-Length'] = stat.size;

  res.writeHead(200, headers);
  if (req.method === 'HEAD') { res.end(); return; }

  const stream = fs.createReadStream(file);
  stream.on('error', () => res.destroy());
  if (gzip) stream.pipe(zlib.createGzip()).pipe(res);
  else stream.pipe(res);
});

server.listen(PORT, HOST, () => {
  console.log('serving ' + ROOT + ' on http://' + HOST + ':' + PORT);
  if (AUTH) console.log('basic auth: ON');
  else console.log('basic auth: OFF - set BASIC_AUTH_USER and BASIC_AUTH_PASS before exposing this publicly');
});

// Railway sends SIGTERM on redeploy; exit cleanly instead of being killed.
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
