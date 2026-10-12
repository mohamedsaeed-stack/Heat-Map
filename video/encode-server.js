'use strict';
// Encode the rendered frame sequence to MP4 inside Chrome (WebCodecs), with no ffmpeg.
//   node encode-server.js 8790  -> open http://localhost:8790/encoder.html
// Serves this folder, lists out/frames, and saves the posted MP4 to out/heat-story-60s.mp4.
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = __dirname, PORT = +process.argv[2] || 8790;
const TYPES = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.png': 'image/png' };
http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/frames') {
    const dir = path.join(ROOT, 'out/frames');
    const list = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /\.(jpe?g|png)$/.test(f)).sort() : [];
    res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(list));
  }
  if (u === '/save' && req.method === 'POST') {
    const out = fs.createWriteStream(path.join(ROOT, 'out/heat-story-60s.mp4'));
    req.pipe(out); out.on('finish', () => { res.writeHead(200); res.end('saved'); }); return;
  }
  const f = path.join(ROOT, u === '/' ? 'encoder.html' : u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(PORT, () => console.log('encoder on http://localhost:' + PORT + '/encoder.html'));
