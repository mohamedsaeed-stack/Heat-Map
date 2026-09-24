'use strict';
// Fold the spilled result files of a "companies changed since <date>" pull into
// one deduplicated delta file, and reconcile against the COUNT the pull was
// planned from.
//
// How the pull works (24 Sep 2026, first CRM refresh after the 20 Sep snapshot):
//   A SINGLE-object query honours ORDER BY and OFFSET (the cross-object traps in
//   START-HERE do not apply), so the changed set is paged 500 at a time:
//     ORDER BY hs_object_id ASC  OFFSET 0..9500   (HubSpot's window stops at 10,000)
//     ORDER BY hs_object_id DESC OFFSET 0..       (the rest, from the other end)
//   The two halves overlap; this script dedupes on hs_object_id. Every page is
//   wide on purpose so it spills to disk and costs ~250 tokens.
//
//   node scripts/parse-company-delta.js <spillDir> <sinceEpochMs> <expectedCount> [outfile]
//
// PII: `phone` comes back whether asked for or not. Dropped here; never written.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const [spillDir, sinceArg, expectedArg, outArg] = process.argv.slice(2);
if (!spillDir || !sinceArg || !expectedArg) {
  console.error('usage: node scripts/parse-company-delta.js <spillDir> <sinceEpochMs> <expectedCount> [outfile]');
  process.exit(1);
}
const since = Number(sinceArg);
const expected = Number(expectedArg);
const OUT = path.join(ROOT, outArg || 'raw/hubspot-companies-delta.json');
const DROP = new Set(['phone', 'phone_formatted']);

const files = fs.readdirSync(spillDir)
  .filter(f => /query_crm_data-(\d+)\.txt$/.test(f) && Number(f.match(/-(\d+)\.txt$/)[1]) >= since)
  .sort();

const byId = new Map();
let pages = 0, rows = 0, dupes = 0;
for (const f of files) {
  let j;
  try { j = JSON.parse(fs.readFileSync(path.join(spillDir, f), 'utf8')); } catch (e) { continue; }
  if (!j || !Array.isArray(j.results)) continue;
  let n = 0;
  for (const r of j.results) {
    if (typeof r.content !== 'string') continue;
    let rec;
    try { rec = JSON.parse(r.content); } catch (e) { continue; }
    if (!rec || !rec.properties || rec.objectTypeId !== '0-2') continue;
    const p = {};
    for (const [k, v] of Object.entries(rec.properties)) {
      if (DROP.has(k) || v === '' || v == null) continue;
      p[k] = v;
    }
    p._objectType = '0-2';
    n++; rows++;
    if (byId.has(p.hs_object_id)) dupes++;
    byId.set(p.hs_object_id, p);
  }
  if (n) pages++;
}

let out = [...byId.values()];
console.log('pages ' + pages + '  rows ' + rows + '  duplicates across the two halves ' + dupes + '  unique ' + out.length + '  expected ' + expected);
// --merge: a top-up pull (records changed since the previous pull) is laid over
// the existing delta file, later record per id wins. The reconciliation above
// applies to the top-up alone; the merged total is just reported.
const MERGE = process.argv.includes('--merge');
// The CRM is live: a record edited between the COUNT and the pull adds one. A small superset is fine; a shortfall is not.
if (out.length > expected && out.length - expected <= 5) console.log('WARNING: ' + (out.length - expected) + ' more than the COUNT - a record was edited between the count and the pull; accepted as a superset.');
else if (out.length !== expected) {
  console.error('DOES NOT RECONCILE - not writing. Missing ' + (expected - out.length) + '.');
  process.exit(2);
}
if (MERGE && fs.existsSync(OUT)) {
  const prevById = new Map(JSON.parse(fs.readFileSync(OUT, 'utf8')).map(r => [r.hs_object_id, r]));
  let replaced = 0;
  for (const r of out) { if (prevById.has(r.hs_object_id)) replaced++; prevById.set(r.hs_object_id, r); }
  out = [...prevById.values()];
  console.log('merged over the existing delta: ' + replaced + ' records replaced, ' + (byId.size - replaced) + ' added, merged total ' + out.length);
}
fs.writeFileSync(OUT, JSON.stringify(out));
console.log('wrote ' + path.relative(ROOT, OUT));

// What changed, for the report.
const has = k => out.filter(r => r[k]).length;
console.log('with address ' + has('address') + '  address2 ' + has('address2') + '  city ' + has('city') + '  state ' + has('state') + '  zip ' + has('zip') + '  country ' + has('country'));
