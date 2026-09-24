'use strict';
// Parse the ALL-DEALS spill files (24 Sep 2026): every deal in the portal, pulled
// cross-object with its company, in createdate chunks of under 500 rows so the
// hard cap could never truncate silently. Same TSV shape as parse-deal-spills.js:
// display labels with the internal name in brackets, two hs_object_id columns
// (deal, then company) and two createdate columns (deal, then company), told
// apart by label prefix and by position.
//
//   node scripts/parse-deal-spills-all.js [spill-dir]
//   -> raw/hubspot-deals-all.json, and per-file row counts to reconcile against
//      the COUNT(*) of each chunk.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SPILL_DIR = process.argv[2] || path.join(
  'C:', 'Users', 'Mohamed', '.claude', 'projects',
  'C--Users-Mohamed-Documents-heatmap--claude-worktrees-determined-bhabha-6ae94f',
  '73fa893a-e6ab-4e23-9253-6ed298ab1af1', 'tool-results'
);
const OUT = path.join(ROOT, 'raw', 'hubspot-deals-all.json');

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
  'State/Region [state]': 'state',
  'Country/Region [country]': 'country',
  'Company Domain Name [domain]': 'domain',
  'Industry [industry]': 'industry',
  'Lifecycle Stage [lifecyclestage]': 'lifecyclestage',
  'Deal Name [dealname]': 'dealname',
  'Deal Type [dealtype]': 'dealtype',
  'Amount in company currency [amount_in_home_currency]': 'amount',
};

function idFromParens(s) {
  const m = /\(([^()]*)\)\s*$/.exec(s || '');
  return m ? m[1] : (s || '');
}

const files = fs.readdirSync(SPILL_DIR)
  .filter(f => f.includes('query_crm_data') && f.endsWith('.txt'))
  .map(f => path.join(SPILL_DIR, f)).sort();

const byDeal = new Map();
let filesUsed = 0, rowsSeen = 0;
const perFile = [];

for (const f of files) {
  let j;
  try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { continue; }
  if (!j || !Array.isArray(j.results) || j.results.length !== 1) continue;
  const text = j.results[0].content;
  if (typeof text !== 'string' || !text.includes('Dataset TSV:')) continue;
  if (!text.includes('[dealstage]')) continue;
  const body = text.split('Dataset TSV:')[1];
  const lines = body.split(/\r?\n/).filter(l => l.trim() && !l.startsWith('Showing '));
  if (lines.length < 2) continue;
  const header = lines[0].split('\t');
  const idx = {};
  let createSeen = 0;
  header.forEach((h, i) => {
    if (h === 'Create Date [createdate]') { idx[createSeen === 0 ? 'createdate' : 'company_createdate'] = i; createSeen++; return; }
    if (COLS[h]) idx[COLS[h]] = i;
  });
  if (idx.deal_id == null) continue;
  filesUsed++;
  const dataLines = lines.slice(1);
  let fileDeals = new Set();
  for (const line of dataLines) {
    const c = line.split('\t');
    const rec = {};
    for (const [k, i] of Object.entries(idx)) { const v = (c[i] || '').trim(); if (v && v !== 'Unassigned') rec[k] = v; }
    if (!rec.deal_id) continue;
    rowsSeen++; fileDeals.add(rec.deal_id);
    const prev = byDeal.get(rec.deal_id);
    if (prev) { for (const kk in rec) if (rec[kk] && !prev[kk]) prev[kk] = rec[kk]; }
    else {
      rec.pipeline_id = idFromParens(rec.pipeline);
      rec.stage_id = idFromParens(rec.dealstage);
      rec.stage_label = (rec.dealstage || '').replace(/\s*\([^()]*\)\s*$/, '');
      rec.industry_value = idFromParens(rec.industry) || rec.industry;
      byDeal.set(rec.deal_id, rec);
    }
  }
  const dates = [...fileDeals].map(id => byDeal.get(id).createdate).filter(Boolean).sort();
  perFile.push({ file: path.basename(f).slice(-18), rows: dataLines.length, deals: fileDeals.size, from: dates[0], to: dates[dates.length - 1] });
}

const deals = [...byDeal.values()];
fs.writeFileSync(OUT, JSON.stringify(deals));
console.log('files ' + filesUsed + '  rows ' + rowsSeen + '  distinct deals ' + deals.length + '  with company ' + deals.filter(d => d.company_id).length);
for (const p of perFile) console.log('  ' + p.file + '  rows ' + String(p.rows).padStart(4) + '  deals ' + String(p.deals).padStart(4) + '  ' + p.from + ' .. ' + p.to + (p.rows >= 500 ? '  !! AT CAP' : ''));
const byPipe = {};
for (const d of deals) byPipe[d.pipeline || '?'] = (byPipe[d.pipeline || '?'] || 0) + 1;
console.log('by pipeline: ' + Object.entries(byPipe).sort((a, b) => b[1] - a[1]).map(([k, n]) => n + ' ' + k).join(' | '));
console.log('wrote ' + path.relative(ROOT, OUT));
