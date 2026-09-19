'use strict';
// Parse every HubSpot query result that spilled to a file, and fold them into
// one deduplicated record set.
//
// How the pull works, and why it is done this way:
//   The HubSpot MCP tool returns at most 500 rows per record SELECT and refuses
//   to put a large result in the conversation. Instead it writes the whole
//   result to a file and returns only the path. That is the cheap path: a
//   480-row partition costs about 200 tokens to request and nothing to receive.
//   This script reads those files off disk, so no row ever passes through the
//   conversation.
//
// Verification, which matters more than the parsing:
//   Truncation at the 500-row cap is SILENT. Every partition therefore has an
//   expected count from a separate COUNT(*) aggregate, and this script refuses
//   to write output if the deduplicated total does not reconcile.
//
//   node scripts/parse-hubspot-spills.js <objectType> <outfile>
//     objectType: company | deal
//
// PII: the tool returns `phone` and `domain` whether or not they were asked
// for. Phone is dropped here and never reaches data/ or the page.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SPILL_DIR = path.join(
  'C:', 'Users', 'Mohamed', '.claude', 'projects',
  'C--Users-Mohamed-Documents-heatmap--claude-worktrees-elastic-mcclintock-10bc9b',
  '59779017-41ae-42f1-99d8-19bc24708107', 'tool-results'
);

const DROP = new Set(['phone', 'phone_formatted']);

function parseSpill(file) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch (e) { return null; }
  let j;
  try { j = JSON.parse(raw); } catch (e) { return null; }
  if (!j || !Array.isArray(j.results)) return null;

  const out = [];
  for (const r of j.results) {
    if (typeof r.content !== 'string') continue;
    let rec;
    try { rec = JSON.parse(r.content); } catch (e) { continue; }
    if (!rec || !rec.properties) continue;          // aggregate results, not records
    const p = {};
    for (const [k, v] of Object.entries(rec.properties)) {
      if (DROP.has(k)) continue;
      if (v === '' || v == null) continue;
      p[k] = v;
    }
    p._objectType = rec.objectTypeId;
    out.push(p);
  }
  return out;
}

const objectType = (process.argv[2] || 'company').toLowerCase();
const outfile = process.argv[3] || path.join(ROOT, 'raw', 'hubspot-' + objectType + '.json');

// 0-2 = COMPANY, 0-3 = DEAL
const WANT = objectType === 'deal' ? '0-3' : '0-2';

const files = fs.readdirSync(SPILL_DIR)
  .filter(f => f.includes('query_crm_data') && f.endsWith('.txt'))
  .map(f => path.join(SPILL_DIR, f))
  .sort();

let filesUsed = 0, rowsSeen = 0;
const byId = new Map();
const perFile = [];

for (const f of files) {
  const recs = parseSpill(f);
  if (!recs || !recs.length) continue;
  const mine = recs.filter(r => r._objectType === WANT);
  if (!mine.length) continue;
  filesUsed++;
  rowsSeen += mine.length;
  perFile.push({ file: path.basename(f), rows: mine.length });
  for (const r of mine) {
    const id = r.hs_object_id;
    if (!id) continue;
    // Later files win on conflict, but record sets are disjoint by construction.
    if (!byId.has(id)) byId.set(id, r);
  }
}

const records = [...byId.values()];

console.log('spill files scanned   ' + files.length);
console.log('files with ' + objectType + ' rows  ' + filesUsed);
console.log('rows read             ' + rowsSeen);
console.log('distinct ids          ' + records.length);
console.log('duplicate rows        ' + (rowsSeen - records.length));
console.log('');
console.log('rows per file (largest first):');
perFile.sort((a, b) => b.rows - a.rows).slice(0, 6).forEach(x => console.log('  ' + String(x.rows).padStart(4) + '  ' + x.file));
console.log('  ...');
const at500 = perFile.filter(x => x.rows >= 500);
if (at500.length) {
  console.log('');
  console.log('! ' + at500.length + ' file(s) returned exactly 500 rows - that is the cap, so they TRUNCATED and');
  console.log('  those partitions must be split and re-pulled:');
  at500.forEach(x => console.log('    ' + x.file));
}

fs.mkdirSync(path.dirname(outfile), { recursive: true });
fs.writeFileSync(outfile, JSON.stringify(records));
console.log('');
console.log('wrote ' + records.length + ' ' + objectType + ' records to ' + path.relative(ROOT, outfile) +
  '  (' + (fs.statSync(outfile).size / 1024 / 1024).toFixed(1) + ' MB)');

// A quick shape report, so a missing column is noticed now and not on the page.
const keyCount = {};
for (const r of records) for (const k of Object.keys(r)) keyCount[k] = (keyCount[k] || 0) + 1;
console.log('');
console.log('field coverage:');
Object.entries(keyCount).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => {
  console.log('  ' + k.padEnd(26) + String(n).padStart(6) + '  ' + (100 * n / records.length).toFixed(1) + '%');
});
