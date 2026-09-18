'use strict';
// Tiny static server so the page can be checked end to end locally.
// The page fetches data/*.json, which file:// blocks, so a real HTTP origin is
// the only way to see it work before publishing.
//   node scripts/serve.js [port]
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8099);
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.js': 'text/javascript' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/page/index.html';
  if (p.startsWith('/data/')) p = p;
  else if (!p.startsWith('/page/')) p = '/page' + p;
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found: ' + p); return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log('serving ' + ROOT + ' on http://localhost:' + PORT));
