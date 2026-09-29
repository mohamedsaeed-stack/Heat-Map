'use strict';
// What changed between two builds of data/map-uae.json - for the "what did the
// CRM refresh do" report. Compares by pin id.
//
//   node scripts/diff-builds.js <old map-uae.json> [new map-uae.json]
//
// Prints plain counts: pins added / removed, pins that moved emirate, precision
// tier up / down, layer changes (crm -> in_process etc.), funded added / removed,
// owner changes. Nothing is written.

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const [oldPath, newPath] = process.argv.slice(2);
if (!oldPath) { console.error('usage: node scripts/diff-builds.js <old map-uae.json> [new]'); process.exit(1); }
const A = JSON.parse(fs.readFileSync(oldPath, 'utf8'));
const B = JSON.parse(fs.readFileSync(newPath || path.join(ROOT, 'data/map-uae.json'), 'utf8'));
const tier = c => c.h === 'geocoded' ? 'exact' : (c.h || 'emirate');
const RANK = { exact: 4, area: 3, emirate: 2, uae: 1 };
const a = new Map(A.companies.map(c => [String(c.i), c]));
const b = new Map(B.companies.map(c => [String(c.i), c]));
const fmt = n => Number(n).toLocaleString('en-US');

let added = 0, removed = 0, movedEm = 0, up = 0, down = 0, fundedAdded = 0, fundedRemoved = 0, ownerChanged = 0;
const layerMoves = {}, emMoves = {}, upFrom = {}, addedByEm = {}, addedByTier = {};
for (const [id, nc] of b) {
  const oc = a.get(id);
  if (!oc) { added++; addedByEm[nc.e || 'UAE, emirate unknown'] = (addedByEm[nc.e || 'UAE, emirate unknown'] || 0) + 1; addedByTier[tier(nc)] = (addedByTier[tier(nc)] || 0) + 1; if (nc.af) fundedAdded++; continue; }
  if ((oc.e || '') !== (nc.e || '')) { movedEm++; const k = (oc.e || '?') + ' -> ' + (nc.e || '?'); emMoves[k] = (emMoves[k] || 0) + 1; }
  const ro = RANK[tier(oc)] || 0, rn = RANK[tier(nc)] || 0;
  if (rn > ro) { up++; const k = tier(oc) + ' -> ' + tier(nc); upFrom[k] = (upFrom[k] || 0) + 1; } else if (rn < ro) down++;
  if (oc.l !== nc.l) { const k = oc.l + ' -> ' + nc.l; layerMoves[k] = (layerMoves[k] || 0) + 1; }
  if (!!oc.af !== !!nc.af) { if (nc.af) fundedAdded++; else fundedRemoved++; }
  if ((oc.o || '') !== (nc.o || '')) ownerChanged++;
}
for (const id of a.keys()) if (!b.has(id)) removed++;

const top = (o, n) => Object.entries(o).sort((x, y) => y[1] - x[1]).slice(0, n).map(([k, v]) => '  ' + k.padEnd(34) + fmt(v).padStart(7)).join('\n');
console.log('PINS            old ' + fmt(A.companies.length) + '  new ' + fmt(B.companies.length) + '  added ' + fmt(added) + '  removed ' + fmt(removed));
console.log('added, by emirate\n' + top(addedByEm, 9));
console.log('added, by precision\n' + top(addedByTier, 4));
console.log('MOVED EMIRATE   ' + fmt(movedEm));
console.log(top(emMoves, 8));
console.log('PRECISION       up ' + fmt(up) + '  down ' + fmt(down));
console.log(top(upFrom, 6));
console.log('LAYER CHANGES');
console.log(top(layerMoves, 12));
console.log('FUNDED          added ' + fmt(fundedAdded) + '  removed ' + fmt(fundedRemoved));
console.log('OWNER CHANGED   ' + fmt(ownerChanged));
const s = k => (A.stats.byLayer[k] || 0) + ' -> ' + (B.stats.byLayer[k] || 0);
console.log('LAYERS          won ' + s('closed_won') + '   open ' + s('in_process') + '   lost ' + s('closed_lost') + '   crm ' + s('crm'));
const m = k => 'AED ' + (A.stats.money[k] / 1e6).toFixed(1) + 'M -> AED ' + (B.stats.money[k] / 1e6).toFixed(1) + 'M';
console.log('MONEY           won ' + m('won') + '   open ' + m('open') + '   lost ' + m('lost'));
console.log('UNKNOWN         ' + fmt(A.stats.excludedUnknown) + ' -> ' + fmt(B.stats.excludedUnknown) + '   NOT UAE ' + fmt(A.stats.excludedNotUAE) + ' -> ' + fmt(B.stats.excludedNotUAE));
console.log('TIERS           ' + JSON.stringify(A.stats.byPlacement) + ' -> ' + JSON.stringify(B.stats.byPlacement));
