'use strict';
// Turn a Google Maps crawl into branch overrides.
//   node scripts/match-branches.js [crawl.jsonl]   (default raw/gmaps-branches-raw.jsonl)
// Crawl line: {i,n,query,mode,entries:[{name,lat,lng,address}],finalUrl}  ("branches" is read as "entries").
// Writes raw/branches-overrides.json and raw/branches-skipped.jsonl.
const fs = require('fs');
const path = require('path');
const { acceptBranches, pickHq, cleanName, deriveEmirateArea } = require('./lib/places-match');

const ROOT = path.join(__dirname, '..');
const MAP = [path.join(ROOT, 'data/map-uae.json'), 'C:/Users/Mohamed/Documents/heatmap/data/map-uae.json'].find(fs.existsSync);
const input = path.resolve(process.argv[2] || path.join(ROOT, 'raw/gmaps-branches-raw.jsonl'));
const fallback = path.join(ROOT, 'raw/gmaps-branches.jsonl');
const file = fs.existsSync(input) ? input : fallback;

const byId = new Map(JSON.parse(fs.readFileSync(MAP, 'utf8')).companies.map(c => [String(c.i), c]));
const lines = fs.readFileSync(file, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l));

const overrides = {}, skipped = [], seenNames = new Set();
const counts = { companies: 0, multi: 0, single: 0, 'no entries': 0, 'weak match': 0, 'not UAE': 0, 'needs geocode only': 0, duplicate: 0 };
const gm = (lat, lng) => 'https://www.google.com/maps/search/?api=1&query=' + lat + ',' + lng;

for (const row of lines) {
  const id = String(row.i);
  const crm = byId.get(id) || {};
  const name = crm.n || row.n || '';
  const key = cleanName(name).toLowerCase();
  const skip = reason => { counts[reason]++; skipped.push({ i: id, n: name, reason, query: row.query || null }); };
  if (seenNames.has(key)) { skip('duplicate'); continue; }
  seenNames.add(key);
  counts.companies++;
  const entries = row.entries || row.branches || row.e || [];
  if (!entries.length) { skip('no entries'); continue; }
  const r = acceptBranches({ n: name }, entries);
  if (!r.branches.length) {
    skip(r.rejected.length && r.rejected.every(x => x.why === 'outside UAE') ? 'not UAE' : 'weak match');
    continue;
  }
  const geo = r.branches.filter(b => !b.needsGeocode);
  if (!geo.length) { skip('needs geocode only'); continue; }
  const hq = pickHq({ ga: crm.ga, a: crm.a, e: crm.e }, geo);
  const main = hq || geo[0];
  const mk = b => {
    const ea = deriveEmirateArea(b.address, b.lat, b.lng);
    return { name: b.name, lat: b.lat, lon: b.lng, address: b.address, emirate: ea.emirate, area: ea.area, hq: b === hq, gmaps: gm(b.lat, b.lng) };
  };
  const bs = geo.map(mk), m = bs[geo.indexOf(main)];
  overrides[id] = { lat: m.lat, lon: m.lon, address: m.address, emirate: m.emirate, area: m.area, placement: 'exact', route: 'Google Maps place', hq: !!hq, branches: bs };
  if (geo.length >= 2) counts.multi++; else counts.single++;
}

fs.writeFileSync(path.join(ROOT, 'raw/branches-overrides.json'), JSON.stringify(overrides));
fs.writeFileSync(path.join(ROOT, 'raw/branches-skipped.jsonl'), skipped.map(s => JSON.stringify(s)).join('\n') + (skipped.length ? '\n' : ''));
console.log('input', path.basename(file), '| lines', lines.length);
console.log('companies', counts.companies, '| with 2+', counts.multi, '| with 1', counts.single);
console.log('skipped:', ['no entries', 'weak match', 'not UAE', 'needs geocode only', 'duplicate'].map(k => k + ' ' + counts[k]).join(', '));
console.log('top chains:');
Object.entries(overrides).sort((a, b) => b[1].branches.length - a[1].branches.length).slice(0, 10)
  .forEach(([id, o]) => console.log(' ', o.branches.length, byId.get(id)?.n || id, '(' + id + ')'));
