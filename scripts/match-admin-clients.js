'use strict';
// Join FlapKap admin-app clients to HubSpot companies by name.
//
// Why by name: the admin app carries no city and no street address on the client
// summary - its only location is `legalAddresses` on the full client record,
// which would cost one API call per client. HubSpot already holds the address
// and it is already geocoded. So the admin app supplies WHO IS REAL and HubSpot
// supplies WHERE THEY ARE. This is the join PLAN.md obstacle 5 describes, and
// the brief's warning applies: "Rain Cafe" / "Rain Cafe LLC" / "RAIN - UAE".
//
//   node scripts/match-admin-clients.js
//
// Output: raw/admin-match.json  { hubspotId -> {adminId, name, fin, industry, score} }
// Every match records HOW it was made, so a weak one can be excluded later.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const admin = read('raw/admin-clients.json');
const companies = read('raw/hubspot-companies.json');

// Legal-form and geography noise that differs between the two systems for the
// same business. Stripped from both sides before comparison.
const NOISE = [
  'llc', 'l l c', 'fze', 'fzco', 'fzc', 'fz llc', 'fz', 'dmcc', 'dwc', 'jlt',
  'est', 'establishment', 'co', 'company', 'ltd', 'limited', 'inc', 'plc',
  'general trading', 'trading', 'trdg', 'gen tr', 'group', 'holding', 'holdings',
  'uae', 'u a e', 'dubai', 'middle east', 'me', 'international', 'intl',
  'the', 'and', 'for', 'of',
];
const NOISE_SET = new Set(NOISE);

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function tokens(s) {
  return norm(s).split(' ').filter(t => t && !NOISE_SET.has(t) && t.length > 1);
}
function key(s) { return tokens(s).join(' '); }

// Jaccard on token sets. Cheap, and good enough at the 85% bar the brief set.
function sim(a, b) {
  const A = new Set(a), B = new Set(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

// Index HubSpot companies by exact normalised key and by each token.
const byKey = new Map();
const byToken = new Map();
for (const c of companies) {
  const k = key(c.name);
  if (!k) continue;
  if (!byKey.has(k)) byKey.set(k, []);
  byKey.get(k).push(c);
  for (const t of new Set(tokens(c.name))) {
    if (!byToken.has(t)) byToken.set(t, []);
    byToken.get(t).push(c);
  }
}

const out = {};
let exact = 0, fuzzy = 0, none = 0, ambiguous = 0;
const unmatchedFunded = [];

for (const a of admin) {
  const k = key(a.name);
  if (!k) { none++; continue; }

  let best = null, bestScore = 0, tie = false;

  const ex = byKey.get(k);
  if (ex && ex.length) {
    if (ex.length > 1) ambiguous++;
    best = ex[0]; bestScore = 1; exact++;
  } else {
    // candidates share at least one meaningful token
    const at = tokens(a.name);
    const seen = new Set();
    const cands = [];
    for (const t of at) {
      const list = byToken.get(t);
      if (!list || list.length > 400) continue;      // a token that common is noise
      for (const c of list) { if (!seen.has(c.hs_object_id)) { seen.add(c.hs_object_id); cands.push(c); } }
    }
    for (const c of cands) {
      const s = sim(at, tokens(c.name));
      if (s > bestScore) { bestScore = s; best = c; tie = false; }
      else if (s === bestScore && s > 0) tie = true;
    }
    if (best && bestScore >= 0.72 && !tie) fuzzy++;
    else { best = null; }
  }

  if (!best) {
    none++;
    if (a.fin === 'REFINANCING') unmatchedFunded.push(a.name);
    continue;
  }

  const prev = out[best.hs_object_id];
  if (!prev || bestScore > prev.score) {
    out[best.hs_object_id] = {
      adminId: a.id, adminName: a.name, fin: a.fin, round: a.round,
      status: a.status, industry: a.ind, channels: a.chan,
      score: Number(bestScore.toFixed(3)), how: bestScore === 1 ? 'exact' : 'fuzzy',
    };
  }
}

fs.writeFileSync(path.join(ROOT, 'raw', 'admin-match.json'), JSON.stringify(out));

const matched = Object.keys(out).length;
const funded = admin.filter(a => a.fin === 'REFINANCING').length;
const matchedFunded = Object.values(out).filter(m => m.fin === 'REFINANCING').length;

console.log('admin clients            ' + admin.length);
console.log('HubSpot companies        ' + companies.length);
console.log('');
console.log('exact name match         ' + exact);
console.log('fuzzy match (>=0.72)     ' + fuzzy);
console.log('no match                 ' + none);
console.log('ambiguous exact keys     ' + ambiguous + '  (more than one HubSpot company shares the name)');
console.log('');
console.log('distinct HubSpot ids matched  ' + matched +
  '  (' + (100 * matched / admin.length).toFixed(1) + '% of admin clients)');
console.log('');
console.log('funded (REFINANCING)     ' + funded);
console.log('  matched to HubSpot     ' + matchedFunded + '  (' + (100 * matchedFunded / funded).toFixed(1) + '%)');
console.log('  unmatched              ' + (funded - matchedFunded));
console.log('');
console.log('A funded client with no HubSpot match cannot be placed: the admin app holds no');
console.log('city and no street address on the client summary, so HubSpot is the only source');
console.log('of location. Those are counted and not drawn.');
console.log('');
console.log('wrote raw/admin-match.json');
