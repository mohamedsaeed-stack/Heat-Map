'use strict';
// Fold the spilled "free_for_all_status = 'Available'" COMPANY pages into
// data/ffa.json: the ids of the unowned lead pool the page shows under the
// "Free for all" filter. Paged like build-contacts.js (windows of 10,000 by id,
// 500 a page); dedupes on hs_object_id and reconciles against the COUNT.
//
//   node scripts/build-ffa.js <spillDir> <sinceEpochMs> <expectedCount>

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data/ffa.json');
const [spillDir, sinceArg, expectedArg] = process.argv.slice(2);
if (!spillDir || !sinceArg || !expectedArg) {
  console.error('usage: node scripts/build-ffa.js <spillDir> <sinceEpochMs> <expectedCount>');
  process.exit(1);
}
const since = Number(sinceArg);
const expected = Number(expectedArg);

const ids = new Set();
for (const f of fs.readdirSync(spillDir)) {
  const m = f.match(/query_crm_data-(\d+)\.txt$/);
  if (!m || Number(m[1]) < since) continue;
  let j;
  try { j = JSON.parse(fs.readFileSync(path.join(spillDir, f), 'utf8')); } catch { continue; }
  for (const r of j.results || []) {
    let rec;
    try { rec = JSON.parse(r.content); } catch { continue; }
    const p = rec.properties || {};
    if (rec.objectTypeId === '0-2' && p.free_for_all_status === 'Available') ids.add(p.hs_object_id);
  }
}

const mapIds = new Set(require(path.join(ROOT, 'data/map-page.json')).companies.map(c => String(c.i)));
const onMap = [...ids].filter(id => mapIds.has(id)).sort();
fs.writeFileSync(OUT, JSON.stringify({ pulled: new Date().toISOString(), ids: onMap }));
console.log(`pool ${ids.size} (expected ${expected}${ids.size === expected ? ', OK' : ', MISMATCH'}); on the map ${onMap.length}, not on the map ${ids.size - onMap.length}`);
