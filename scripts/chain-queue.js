'use strict';
// Chains need one search per emirate: a single search returns at most 20 listings, centred on one city.
//   node scripts/chain-queue.js <overrides.json>... > writes raw/branch-queue-chains.json
// Picks companies with 5+ matched branches, or whose raw search came back full (18+ listings).
const fs = require('fs'), path = require('path');
const { cleanName } = require('./lib/places-match');
const ROOT = path.join(__dirname, '..');
const EMIRATES = ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Ras Al Khaimah', 'Umm Al Quwain', 'Fujairah'];
const rawCount = new Map();
for (const f of fs.readdirSync(path.join(ROOT, 'raw/branch-batches'))) {
  for (const l of fs.readFileSync(path.join(ROOT, 'raw/branch-batches', f), 'utf8').split('\n')) {
    if (!l.trim()) continue; const r = JSON.parse(l); rawCount.set(String(r.i), Math.max(rawCount.get(String(r.i)) || 0, (r.e || []).length));
  }
}
const names = new Map(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/map-uae.json'), 'utf8')).companies.map(c => [String(c.i), c.n]));
const out = [], seen = new Set();
for (const f of process.argv.slice(2)) {
  const o = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const [id, v] of Object.entries(o)) {
    if (seen.has(id)) continue;
    if (v.branches.length < 5 && (rawCount.get(id) || 0) < 18) continue;
    seen.add(id);
    const n = names.get(id) || v.branches[0].name, b = cleanName(n);
    for (const e of EMIRATES) out.push({ i: id, n, e, q: b + ' ' + e });
  }
}
fs.writeFileSync(path.join(ROOT, 'raw/branch-queue-chains.json'), JSON.stringify(out));
console.log('chains', seen.size, '| searches', out.length);
