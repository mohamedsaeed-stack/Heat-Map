'use strict';
// Crawl Google Maps' own search endpoint from node (no browser, no API key).
//   node scripts/gmaps-endpoint-crawl.js [from] [to] [cap]
// Reads raw/branch-queue.json, writes raw/branch-batches/batch-NNN.jsonl (25 per file, queue order)
// and raw/branch-progress.json. Row: {i,n,q,e:[{name,lat,lng}],err?}.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const queue = JSON.parse(fs.readFileSync(path.join(ROOT, process.env.QUEUE || 'raw/branch-queue.json'), 'utf8'));
const prog = path.join(ROOT, process.env.PROG || 'raw/branch-progress.json');
const from = +(process.argv[2] ?? (fs.existsSync(prog) ? JSON.parse(fs.readFileSync(prog, 'utf8')).nextIndex : 0));
const to = Math.min(+(process.argv[3] ?? queue.length), queue.length);
const CAP = +(process.argv[4] ?? 8);
const PB = '!4m9!1m3!1d60000!2d55.27!3d25.2!2m0!3m2!1i1024!2i768!4f13.1!7i20!10b1';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const inUAE = (lat, lng) => lat >= 22 && lat <= 26.5 && lng >= 51 && lng <= 56.5;

// Walk the parsed array: a place is [null,null,lat,lng] followed (nearby, in the same parent) by a "0x..:0x.." id and a name.
function extract(data, cap) {
  const out = [], seen = new Set();
  (function walk(a) {
    if (!Array.isArray(a)) return;
    for (let k = 0; k < a.length; k++) {
      const v = a[k];
      if (Array.isArray(v) && v.length === 4 && v[0] == null && v[1] == null && typeof v[2] === 'number' && typeof v[3] === 'number' && inUAE(v[2], v[3])) {
        // name: first non-id, non-URL string after the coord in the parent
        let name = null;
        for (let j = k + 1; j < a.length && j < k + 10; j++) {
          const s = a[j];
          if (typeof s === 'string' && !/^0x|^https?:|^\/|^[A-Za-z0-9_-]{20,}$/.test(s) && s.trim()) { name = s; break; }
        }
        if (name) { const key = name + '|' + v[2].toFixed(5) + '|' + v[3].toFixed(5); if (!seen.has(key)) { seen.add(key); out.push({ name, lat: v[2], lng: v[3] }); } }
      }
      walk(v);
    }
  })(data);
  return out.slice(0, cap);
}

async function one(q) {
  const url = 'https://www.google.com/search?tbm=map&authuser=0&hl=en&gl=ae&q=' + encodeURIComponent(q) + '&pb=' + PB;
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 10000);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' }, signal: ctl.signal });
    const txt = await r.text();
    if (!r.ok) return { err: 'http ' + r.status, e: [] };
    if (/^\s*<!doctype|<html/i.test(txt)) return { err: 'html (consent/captcha)', e: [] };
    const data = JSON.parse(txt.replace(/^\)\]\}'\s*/, ''));
    return { e: extract(data, CAP) };
  } catch (e) { return { err: String(e.message || e).slice(0, 80), e: [] }; }
  finally { clearTimeout(t); }
}

(async () => {
  if (process.argv[2] === 'test') { const q = process.argv[3] || 'Filli Cafe Dubai'; console.log(JSON.stringify(await one(q), null, 1)); return; }
  console.log('crawl', from, '->', to, 'cap', CAP);
  let i = from, batchRows = [], errs = 0, zero = 0;
  while (i < to) {
    const slice = queue.slice(i, Math.min(i + 5, to));
    const res = await Promise.all(slice.map(x => one(x.q || (x.n + ' UAE'))));
    res.forEach((r, k) => { const x = slice[k]; const row = { i: x.i, n: x.n, q: x.q, e: r.e }; if (r.err) { row.err = r.err; errs++; } if (!r.e.length) zero++; batchRows.push(row); });
    i += slice.length;
    if (batchRows.length >= 25 || i >= to) {
      const n = Math.floor((i - batchRows.length) / 25);
      fs.writeFileSync(path.join(ROOT, 'raw/branch-batches', (process.env.PREFIX || 'batch-') + String(n).padStart(3, '0') + '.jsonl'), batchRows.map(r => JSON.stringify(r)).join('\n') + '\n');
      fs.writeFileSync(prog, JSON.stringify({ nextIndex: i }));
      process.stdout.write(`${i} done, errs ${errs}, zero ${zero}\n`);
      batchRows = [];
      if (errs > 20) { console.log('too many errors, stopping'); break; }
    }
    await new Promise(r => setTimeout(r, 400));
  }
})();
