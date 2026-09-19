'use strict';
// Locate CRM companies by matching their NAME to a named OpenStreetMap place.
//
// The problem this solves: 15,621 of 18,866 Dubai companies have no usable
// street address, so they can never be geocoded. Almost all of them do have a
// name, and OpenStreetMap knows where tens of thousands of named Dubai
// businesses are. Matching name to name gives a real coordinate with no
// address, no paid API and no per-company web request.
//
//   node scripts/locate-by-name.js
//
// Writes raw/name-locations.json: hubspotId -> {lat,lng,osm,matchedName,score}
//
// ACCURACY IS THE WHOLE RISK HERE. A loose match puts a business on the wrong
// building and the map lies. So:
//   - legal-form noise (LLC, FZE, Trading, Dubai, ...) is stripped from both
//     sides before comparing, because it carries no identity
//   - a match needs at least two meaningful tokens, or one long distinctive one
//   - a normalised name that maps to more than one DIFFERENT OSM location is
//     refused outright: "Al Madina Supermarket" exists forty times and none of
//     them can be assigned
//   - generic names are refused by a stop-list

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const companies = read('raw/hubspot-companies.json');

// Every named OSM place available: the broad pull if it exists, otherwise the
// seven-category universe.
// BOTH sources, merged and deduplicated by OSM id. The broad named pull is
// wider but its tourism query failed with a 504, so the seven-category universe
// still carries the hotels. Using only one of them would silently drop places.
const osmById = new Map();
if (fs.existsSync(path.join(ROOT, 'raw', 'osm-named.json'))) {
  for (const p of read('raw/osm-named.json')) osmById.set(p.id, p);
}
{
  const summary = read('data/universe-dubai.json');
  for (const meta of Object.values(summary.categories)) {
    if (!meta.file) continue;
    for (const p of read('data/' + meta.file).places) if (!osmById.has(p.id)) osmById.set(p.id, p);
  }
}
const osm = [...osmById.values()];

const NOISE = new Set([
  'llc','l','c','fze','fzco','fzc','fz','dmcc','dwc','est','establishment',
  'co','company','ltd','limited','inc','plc','group','holding','holdings',
  'general','trading','trdg','tr','gen','uae','u','a','e','dubai','emirates',
  'middle','east','me','international','intl','the','and','for','of','new',
  'deal','branch','br','llp','sole','proprietorship','fzllc','difc',
]);

// Names too generic to identify anything.
const STOP = new Set([
  'supermarket','restaurant','cafe','coffee shop','pharmacy','clinic','bakery',
  'laundry','salon','barber','grocery','hypermarket','garage','workshop',
  'car wash','mini mart','market','hotel','store','shop','centre','center',
  'medical centre','medical center','trading','services','solutions','technologies',
]);

function norm(s) {
  return String(s || '').toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
function tokens(s) {
  return norm(s).split(' ').filter(t => t && !NOISE.has(t) && t.length > 1);
}
function key(s) { return tokens(s).join(' '); }

// Is this name distinctive enough to trust a match on?
function usable(k) {
  if (!k) return false;
  if (STOP.has(k)) return false;
  const t = k.split(' ');
  if (t.length >= 2) return true;
  return t[0].length >= 6;          // one token, but a long and unusual one
}

// Index OSM places by normalised name. A key that resolves to more than one
// DISTINCT location is poisoned and refused.
const osmByKey = new Map();
for (const p of osm) {
  const k = key(p.n);
  if (!usable(k)) continue;
  if (!osmByKey.has(k)) osmByKey.set(k, []);
  osmByKey.get(k).push(p);
}

let ambiguousKeys = 0;
for (const [k, list] of osmByKey) {
  const distinct = new Set(list.map(p => p.y.toFixed(3) + ',' + p.x.toFixed(3)));
  if (distinct.size > 1) { osmByKey.set(k, null); ambiguousKeys++; }
}

const out = {};
let matched = 0, refusedAmbiguous = 0, refusedGeneric = 0, noMatch = 0;

for (const c of companies) {
  const k = key(c.name);
  if (!usable(k)) { refusedGeneric++; continue; }
  const hit = osmByKey.get(k);
  if (hit === undefined) { noMatch++; continue; }
  if (hit === null) { refusedAmbiguous++; continue; }
  const p = hit[0];
  out[c.hs_object_id] = {
    lat: p.y, lng: p.x, osm: p.id, matchedName: p.n, kind: p.k, score: 1,
  };
  matched++;
}

fs.writeFileSync(path.join(ROOT, 'raw', 'name-locations.json'), JSON.stringify(out));

console.log('CRM companies              ' + companies.length.toLocaleString('en-US'));
console.log('named OSM places available ' + osm.length.toLocaleString('en-US'));
console.log('usable OSM name keys       ' + [...osmByKey.values()].filter(Boolean).length.toLocaleString('en-US'));
console.log('  refused as ambiguous     ' + ambiguousKeys.toLocaleString('en-US') + '  (same name, different places)');
console.log('');
console.log('MATCHED                    ' + matched.toLocaleString('en-US'));
console.log('  company name too generic ' + refusedGeneric.toLocaleString('en-US'));
console.log('  name is ambiguous in OSM ' + refusedAmbiguous.toLocaleString('en-US'));
console.log('  no OSM place of that name' + ' ' + noMatch.toLocaleString('en-US'));
console.log('');
console.log('wrote raw/name-locations.json');
