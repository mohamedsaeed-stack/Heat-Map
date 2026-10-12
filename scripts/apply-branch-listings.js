// Folds the branch crawl's exact Google listings (raw/branches-overrides.json, from
// match-branches.js) into raw/gmaps-overrides.json, the file build-map-data-uae.js
// uses to move a pin onto its Google Maps place. Only a company's HQ listing with a
// place id (cid) is used, or its single listing when no HQ is marked; name-only
// matches without a cid stay where the CRM put them. Hand-checked entries already in
// gmaps-overrides.json are kept when the crawl has nothing better.
//   node scripts/apply-branch-listings.js
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const src = JSON.parse(fs.readFileSync(path.join(ROOT, 'raw/branches-overrides.json'), 'utf8'));
let out = {};
try { out = JSON.parse(fs.readFileSync(path.join(ROOT, 'raw/gmaps-overrides.json'), 'utf8')); } catch (e) {}
const before = Object.keys(out).length;
let hq = 0, single = 0, replaced = 0;
for (const [id, r] of Object.entries(src)) {
  const bs = (r.branches || []).filter(b => b.cid && b.lat != null && b.lon != null);
  if (!bs.length) continue;
  const b = bs.find(x => x.hq) || (bs.length === 1 ? bs[0] : null);
  if (!b) continue;
  if (b === bs.find(x => x.hq)) hq++; else single++;
  if (out[id]) replaced++;
  const where = [b.address, b.label].filter(Boolean).join(', ');
  out[id] = { y: b.lat, x: b.lon, e: b.emirate || null, a: b.area || b.label || null,
    ga: (where ? where + ' ' : '') + '(Google Maps: ' + b.name + ')', gn: b.name, cid: b.cid };
}
fs.writeFileSync(path.join(ROOT, 'raw/gmaps-overrides.json'), JSON.stringify(out, null, 1));
console.log(`gmaps-overrides: ${before} before, ${Object.keys(out).length} after (${hq} HQ listings, ${single} single listings, ${replaced} hand-checked entries replaced)`);
