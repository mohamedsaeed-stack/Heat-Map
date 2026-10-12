'use strict';
// Queue for the Dubai CRM-only companies the branch crawl never searched (12 Oct 2026).
//   node scripts/dubai-queue.js   -> raw/branch-queue-dubai.json
// Skips ids already in any raw/branch-batches/*.jsonl row and ids already matched in
// raw/branches-overrides.json. Query = cleaned name + " Dubai", as in the other queues.
const fs = require('fs'), path = require('path');
const { cleanName } = require('./lib/places-match');
const ROOT = path.join(__dirname, '..');
const seen = new Set();
for (const f of fs.readdirSync(path.join(ROOT, 'raw/branch-batches'))) {
  if (!f.endsWith('.jsonl')) continue;
  for (const l of fs.readFileSync(path.join(ROOT, 'raw/branch-batches', f), 'utf8').split('\n')) {
    if (!l.trim()) continue; try { seen.add(String(JSON.parse(l).i)); } catch (e) {}
  }
}
const matched = JSON.parse(fs.readFileSync(path.join(ROOT, 'raw/branches-overrides.json'), 'utf8'));
const map = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/map-uae.json'), 'utf8'));
const out = [];
for (const c of map.companies) {
  if (c.l !== 'crm' || c.e !== 'Dubai') continue;
  const id = String(c.i);
  if (seen.has(id) || matched[id]) continue;
  const b = cleanName(c.n);
  if (!b || b.length < 3) continue;
  out.push({ i: id, n: c.n, l: c.l, e: 'Dubai', h: c.h, q: b + ' Dubai' });
}
fs.writeFileSync(path.join(ROOT, 'raw/branch-queue-dubai.json'), JSON.stringify(out));
console.log(out.length + ' Dubai companies queued');
