'use strict';
// Parse the DEAL spill files.
//
// Cross-object queries (SELECT ... COMPANY.x FROM DEAL) come back in a DIFFERENT
// shape from plain record selects: a single TSV dataset rather than one JSON
// object per record. The header carries display labels with the internal name in
// brackets, and TWO columns are called hs_object_id - one for the deal, one for
// the company - so they can only be told apart by their label prefix.
//
//   node scripts/parse-deal-spills.js

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SPILL_DIR = path.join(
  'C:', 'Users', 'Mohamed', '.claude', 'projects',
  'C--Users-Mohamed-Documents-heatmap--claude-worktrees-elastic-mcclintock-10bc9b',
  '59779017-41ae-42f1-99d8-19bc24708107', 'tool-results'
);
const OUT = path.join(ROOT, 'raw', 'hubspot-deals.json');

// header label -> the field name we want to keep
const COLS = {
  'Deal [hs_object_id]': 'deal_id',
  'Company [hs_object_id]': 'company_id',
  'Pipeline [pipeline]': 'pipeline',
  'Deal Stage [dealstage]': 'dealstage',
  'Close Date [closedate]': 'closedate',
  'Closed Lost Reason [closed_lost_reason]': 'closed_lost_reason',
  'Risk Rejected Reason [risk_rejected_reason]': 'risk_rejected_reason',
  'Pre Nop Rejection Reason [pre_nop_rejection_reason]': 'pre_nop_rejection_reason',
  'Deal owner [hubspot_owner_id]': 'owner_id',
  'Company name [name]': 'company_name',
  'Street Address [address]': 'address',
  'City [city]': 'city',
  'Industry [industry]': 'industry',
  'Deal Name [dealname]': 'dealname',
  'Amount in company currency [amount_in_home_currency]': 'amount',
};

// "Canopy Deal Pipeline (3211046101)" -> id; "UAE Pipeline (default)" -> "default"
function idFromParens(s) {
  const m = /\(([^()]*)\)\s*$/.exec(s || '');
  return m ? m[1] : (s || '');
}

const files = fs.readdirSync(SPILL_DIR)
  .filter(f => f.includes('query_crm_data') && f.endsWith('.txt'))
  .map(f => path.join(SPILL_DIR, f));

const byDeal = new Map();
let filesUsed = 0, rowsSeen = 0, truncated = [];

for (const f of files) {
  let j;
  try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { continue; }
  if (!j || !Array.isArray(j.results) || j.results.length !== 1) continue;
  const text = j.results[0].content;
  if (typeof text !== 'string' || !text.includes('Dataset TSV:')) continue;
  if (!text.includes('[dealstage]')) continue;   // not a deal dataset

  const body = text.split('Dataset TSV:')[1];
  const lines = body.split(/\r?\n/).filter(l => l.trim() && !l.startsWith('Showing '));
  if (lines.length < 2) continue;

  const header = lines[0].split('\t');
  const idx = {};
  header.forEach((h, i) => { if (COLS[h]) idx[COLS[h]] = i; });
  if (idx.deal_id == null) continue;

  filesUsed++;
  const dataLines = lines.slice(1);
  if (dataLines.length >= 500) truncated.push(path.basename(f) + ' (' + dataLines.length + ' rows)');

  for (const line of dataLines) {
    const c = line.split('\t');
    const rec = {};
    for (const [k, i] of Object.entries(idx)) {
      const v = (c[i] || '').trim();
      if (v) rec[k] = v;
    }
    if (!rec.deal_id) continue;
    rowsSeen++;
    // Cross-object selects FAN OUT: one row per associated company. Dedupe on
    // the deal id, which is why the deal id is pulled at all.
    var prev = byDeal.get(rec.deal_id);
    if (prev) { for (var kk in rec) if (rec[kk] && !prev[kk]) prev[kk] = rec[kk]; }
    else {
      rec.pipeline_id = idFromParens(rec.pipeline);
      rec.stage_id = idFromParens(rec.dealstage);
      rec.stage_label = (rec.dealstage || '').replace(/\s*\([^()]*\)\s*$/, '');
      rec.industry_value = idFromParens(rec.industry) || rec.industry;
      byDeal.set(rec.deal_id, rec);
    }
  }
}

const deals = [...byDeal.values()];
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(deals));

console.log('deal datasets found  ' + filesUsed);
console.log('rows read            ' + rowsSeen);
console.log('distinct deals       ' + deals.length);
console.log('fan-out duplicates   ' + (rowsSeen - deals.length));
console.log('with a company id    ' + deals.filter(d => d.company_id).length);
console.log('with an address      ' + deals.filter(d => d.address).length);
if (truncated.length) {
  console.log('');
  console.log('! these datasets hit the 500-row cap and TRUNCATED - split and re-pull:');
  truncated.forEach(t => console.log('    ' + t));
}
console.log('');
const byPipe = {};
for (const d of deals) byPipe[d.pipeline || '?'] = (byPipe[d.pipeline || '?'] || 0) + 1;
console.log('by pipeline:');
Object.entries(byPipe).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log('  ' + String(n).padStart(5) + '  ' + k));
console.log('');
console.log('wrote ' + deals.length + ' deals to ' + path.relative(ROOT, OUT));
