// Turns the hand-checked Google Maps lookups (raw/gmaps-results.jsonl) into
// raw/gmaps-overrides.json {companyId: {y,x,e,a,ga,gn}} for build-map-data-uae.js.
// Only matches whose Google Maps name clearly is the company are accepted
// (list below, reviewed by eye); look-alikes and multi-branch lists are skipped.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const todo = JSON.parse(fs.readFileSync(path.join(ROOT, 'raw/gmaps-todo.json'), 'utf8'));
const ACCEPT = new Set([0,1,2,3,4,5,7,8,9,10,11,12,15,17,19,21,23,24,25,26,27,28,29,31,38,39,40,41,42,44,46,47,49,52,55,57,60,61,66,69,71,73,74,75,76,84,86,92,94,96,98,99,103,107,115,117,118,119,120,122,123,124,125,127,135,136,142,145,146,150,151,156,161]);
const EM = ['Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah'];
const out = {};
for (const line of fs.readFileSync(path.join(ROOT, 'raw/gmaps-results.jsonl'), 'utf8').split('\n')) {
  if (!line.trim()) continue;
  const r = JSON.parse(line);
  if (!r.c) continue;
  let idx = /^x(\d+)$/.test(r.i) ? +r.i.slice(1) : todo.findIndex(t => t.i === r.i);
  if (idx < 0 || !ACCEPT.has(idx)) continue;
  const parts = String(r.a || '').split(' - ').map(s => s.trim()).filter(Boolean);
  const e = EM.find(x => parts.includes(x)) || (r.c[0] > 25.45 ? 'Umm Al Quwain' : r.c[1] > 55.4 && r.c[0] > 25.25 ? 'Sharjah' : null);
  const ei = e ? parts.lastIndexOf(e) : parts.length;
  const area = ei > 0 ? parts[ei - 1].replace(/^\d+\s*/, '') : null;
  out[todo[idx].i] = { y: r.c[0], x: r.c[1], e, a: area, ga: ((r.a ? r.a + ' ' : '') + '(Google Maps: ') + r.t + ')', gn: todo[idx].n };
}
fs.writeFileSync(path.join(ROOT, 'raw/gmaps-overrides.json'), JSON.stringify(out, null, 1));
console.log(Object.keys(out).length + ' overrides');
