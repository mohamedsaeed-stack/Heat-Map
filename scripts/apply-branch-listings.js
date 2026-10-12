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
// Name-only matches (no place id) are taken only when the listing name is the company
// name (one a prefix of the other, after normalising) and the emirates agree: 1,528 of
// 2,121 on 12 Oct 2026. Their link stays a name search.
const names = new Map(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/map-uae.json'), 'utf8')).companies.map(c => [String(c.i), c]));
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, ' ').trim();
let hq = 0, single = 0, strict = 0, replaced = 0;
for (const [id, r] of Object.entries(src)) {
  let bs = (r.branches || []).filter(b => b.cid && b.lat != null && b.lon != null);
  let b = bs.find(x => x.hq) || (bs.length === 1 ? bs[0] : null);
  if (b) { if (b === bs.find(x => x.hq)) hq++; else single++; }
  else {
    const c = names.get(id), all = (r.branches || []).filter(x => x.lat != null && x.lon != null);
    const h = all.find(x => x.hq) || all[0];
    if (!c || !h) continue;
    const a = norm(c.n), g = norm(String(h.name).split(/\s[|·-]\s/)[0]);
    const nameOk = a && g && (a === g || a.startsWith(g) || g.startsWith(a));
    const emOk = !c.e || !h.emirate || c.e === 'UAE' || c.e === h.emirate;
    if (!nameOk || !emOk) continue;
    b = h; strict++;
  }
  if (out[id]) replaced++;
  const where = [b.address, b.label].filter(Boolean).join(', ');
  out[id] = { y: b.lat, x: b.lon, e: b.emirate || null, a: b.area || b.label || null,
    ga: (where ? where + ' ' : '') + '(Google Maps: ' + b.name + ')', gn: b.name, cid: b.cid || null };
}
fs.writeFileSync(path.join(ROOT, 'raw/gmaps-overrides.json'), JSON.stringify(out, null, 1));
console.log(`gmaps-overrides: ${before} before, ${Object.keys(out).length} after (${hq} HQ listings, ${single} single listings, ${strict} strict name-only matches, ${replaced} entries replaced)`);
