'use strict';
// Allocate every CRM company to a UAE emirate, and to an area inside it where
// the evidence supports one.
//
// The rule the user set: use emirate names, city names and UAE names. Nothing
// else counts as a location. Evidence is taken in strict precedence order and
// the FIRST field that yields an emirate wins, so a reliable field is never
// overridden by a weaker one.
//
//   1 city -> 2 state -> 3 address -> 4 name -> 5 contact city
//   country only ever proves "UAE", never which emirate.
//
// Guard that matters most: a company NAMED "... Dubai" whose own country says
// India is an Indian company. So the name route is refused whenever the record
// carries a country that is not the UAE. This was not theoretical - the name
// sweep returned companies registered in India, Malaysia, Czechia and the US.
//
// Output precision, which drives how the pin is drawn:
//   address  - a street address exists, can be geocoded to a point
//   area     - an area/community is known; pin scatters inside that area
//   emirate  - only the emirate is known; pin scatters inside the emirate
//   uae      - UAE but no emirate; counted, never drawn
//
//   node scripts/allocate-places.js

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PLACES = JSON.parse(fs.readFileSync(path.join(ROOT, 'lookups/uae-places.json'), 'utf8'));

const norm = s => String(s || '')
  .toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^\p{L}\p{N}\s]/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// Build the match tables once.
const EMIRATES = Object.entries(PLACES.emirates);
const AREA_INDEX = [];   // {area, emirate, needle}
for (const [em, def] of EMIRATES) {
  for (const a of def.areas || []) AREA_INDEX.push({ area: a, emirate: em, needle: norm(a) });
}
// The previous session built and geocoded 91 Dubai communities with aliases
// ("jlt" -> Jumeirah Lakes Towers). Reusing them costs nothing and is the
// difference between a pin that says "somewhere in Dubai" and one that says
// "Al Quoz". Their centroids are already on disk in communities-geocoded.json.
try {
  const dc = JSON.parse(fs.readFileSync(path.join(ROOT, 'lookups/dubai-communities.json'), 'utf8'));
  for (const c of dc.communities || []) {
    for (const al of (c.aliases && c.aliases.length ? c.aliases : [c.name])) {
      AREA_INDEX.push({ area: c.name, emirate: 'Dubai', needle: norm(al) });
    }
  }
} catch (e) { /* optional */ }

// Longest area names first so "Al Ain City" wins over "Al Ain", and
// "Jumeirah Lakes Towers" wins over "Jumeirah".
AREA_INDEX.sort((a, b) => b.needle.length - a.needle.length);
// A needle under 4 characters matches inside unrelated words; drop it.
const AREA_INDEX_SAFE = AREA_INDEX.filter(a => a.needle.length >= 4);

const UAE_TOKENS = PLACES.uae_tokens.map(norm);

function emirateFrom(text, allowShort) {
  const t = norm(text);
  if (!t) return null;
  const hits = new Set();
  for (const [em, def] of EMIRATES) {
    for (const al of def.aliases) if (t.includes(norm(al))) hits.add(em);
    if (allowShort) for (const s of def.safe_short || []) {
      if (new RegExp('(^|\\s)' + s + '($|\\s)').test(t)) hits.add(em);
    }
  }
  if (hits.size === 1) return [...hits][0];
  return null;                       // 0 = no match, >1 = ambiguous, both refused
}

function areaFrom(text, restrictTo) {
  const t = norm(text);
  if (!t) return null;
  for (const a of AREA_INDEX_SAFE) {
    if (restrictTo && a.emirate !== restrictTo) continue;
    if (t.includes(a.needle)) return a;
  }
  return null;
}

function isUAE(text) {
  const t = norm(text);
  if (!t) return false;
  return UAE_TOKENS.some(x => t.includes(x));
}

function allocate(c, contactCities) {
  const out = { emirate: null, area: null, precision: null, route: null, uae: false };

  if (isUAE(c.country) || isUAE(c.state) || isUAE(c.city)) out.uae = true;

  // 1-2: the record's own city, then state. Area first, then emirate.
  for (const [field, route] of [['city', 'own city'], ['state', 'own state']]) {
    const v = c[field];
    if (!v) continue;
    const ar = areaFrom(v);
    if (ar) { out.emirate = ar.emirate; out.area = ar.area; out.route = route + ' (area)'; break; }
    const em = emirateFrom(v, true);
    if (em) { out.emirate = em; out.route = route; break; }
  }

  // 3: address free text.
  if (!out.emirate && c.address) {
    const ar = areaFrom(c.address);
    if (ar) { out.emirate = ar.emirate; out.area = ar.area; out.route = 'address (area)'; }
    else {
      const em = emirateFrom(c.address, false);
      if (em) { out.emirate = em; out.route = 'address'; }
    }
  }
  // Once the emirate is settled, an area can still be recovered from any free
  // text on the record, restricted to that emirate so a Sharjah area is never
  // attached to a Dubai company. Names carry areas constantly here -
  // "Al Quoz Auto Spare Parts" names its own neighbourhood.
  if (out.emirate && !out.area) {
    for (const [field, label] of [['address', 'address'], ['zip', 'zip'], ['name', 'name']]) {
      if (!c[field]) continue;
      const ar = areaFrom(c[field], out.emirate);
      if (ar) { out.area = ar.area; out.route += ' + ' + label + ' area'; break; }
    }
  }

  // 4: the company name - refused when its own country says somewhere else.
  const countrySaysElsewhere = c.country && !isUAE(c.country);
  if (!out.emirate && c.name && !countrySaysElsewhere) {
    const em = emirateFrom(c.name, false);
    if (em) { out.emirate = em; out.route = 'name'; }
  }

  // 5: contacts, only if the company itself gave nothing.
  if (!out.emirate && contactCities && contactCities.length) {
    const hits = new Set();
    for (const cc of contactCities) { const em = emirateFrom(cc, false); if (em) hits.add(em); }
    if (hits.size === 1) { out.emirate = [...hits][0]; out.route = 'contact city'; out.uae = true; }
  }

  if (out.emirate) out.uae = true;

  if (c.address && out.emirate) out.precision = 'address';
  else if (out.area) out.precision = 'area';
  else if (out.emirate) out.precision = 'emirate';
  else if (out.uae) out.precision = 'uae';

  return out;
}

function load(f) {
  const p = path.join(ROOT, 'raw', f);
  if (!fs.existsSync(p)) return [];
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  return Array.isArray(j) ? j : [];
}

function main() {
  // Dubai set from the previous session carries no city field - it IS Dubai by
  // construction (it was pulled with a Dubai city filter), so it is seeded.
  const dubai = load('hubspot-companies.json').map(c => ({ ...c, city: c.city || 'Dubai' }));
  const sets = [
    ['dubai-city', dubai],
    ['uae-city', load('uae-noncity-dubai.json')],
    ['nocity-country-state', load('uae-nocity-groupA.json')],
    ['nocity-address-name', load('uae-nocity-groupBC.json')],
  ];

  const byId = new Map();
  for (const [src, arr] of sets) {
    for (const c of arr) {
      const id = c.hs_object_id;
      if (!id) continue;
      const prev = byId.get(id);
      if (prev) { Object.assign(prev, c); continue; }   // richer copy wins
      byId.set(id, { ...c, _src: src });
    }
  }

  // Contact evidence: the only route that reaches a company carrying no
  // location of its own. It is used LAST, and only to name an emirate - a
  // contact's city never produces a street-level pin, because just 53 contacts
  // in the whole CRM hold an address.
  //
  // NOTE: this evidence is PARTIAL. Cross-object queries cannot be paginated
  // (ORDER BY returns empty, OFFSET is silently ignored), so they are cut by
  // createdate, and two slices came back at exactly the 500-row cap. Dubai and
  // Abu Dhabi are well covered; the small emirates are not. Companies found
  // only this way are a floor, never a total.
  const evidence = new Map();
  try {
    for (const e of JSON.parse(fs.readFileSync(path.join(ROOT, 'raw/contact-city-evidence.json'), 'utf8'))) {
      evidence.set(String(e.company_id), e);
    }
  } catch (err) { /* no evidence file yet */ }

  // Companies that exist ONLY in the contact evidence are real CRM companies
  // that every other sweep missed. Seed them from what the contact query
  // returned about their company.
  let contactOnly = 0;
  for (const [cid, e] of evidence) {
    if (byId.has(cid)) continue;
    byId.set(cid, { hs_object_id: cid, name: e.name, industry: e.industry, _src: 'contact-only' });
    contactOnly++;
  }

  const tally = {};
  const precision = {};
  const routes = {};
  const out = [];

  for (const c of byId.values()) {
    const e = evidence.get(String(c.hs_object_id));
    const a = allocate(c, e ? Object.keys(e.contact_cities || {}) : null);
    const em = a.emirate || (a.uae ? 'UAE (emirate unknown)' : 'not UAE');
    tally[em] = (tally[em] || 0) + 1;
    precision[a.precision || 'none'] = (precision[a.precision || 'none'] || 0) + 1;
    if (a.route) routes[a.route] = (routes[a.route] || 0) + 1;
    out.push({
      id: c.hs_object_id, name: c.name || null,
      industry: c.industry || null, lifecyclestage: c.lifecyclestage || null,
      address: c.address || null,
      emirate: a.emirate, area: a.area, precision: a.precision, route: a.route, src: c._src,
    });
  }

  const pad = (s, n) => String(s).padEnd(n);
  const num = n => n.toLocaleString().padStart(8);

  console.log('DISTINCT COMPANIES  ' + byId.size.toLocaleString());
  console.log('  found only via a contact\'s city: ' + contactOnly.toLocaleString());
  console.log('');
  console.log('BY EMIRATE');
  for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log('  ' + pad(k, 26) + num(v));
  console.log('');
  console.log('BY PRECISION (how the pin can be drawn)');
  for (const [k, v] of Object.entries(precision).sort((a, b) => b[1] - a[1])) console.log('  ' + pad(k, 26) + num(v));
  console.log('');
  console.log('BY EVIDENCE ROUTE');
  for (const [k, v] of Object.entries(routes).sort((a, b) => b[1] - a[1])) console.log('  ' + pad(k, 26) + num(v));

  fs.writeFileSync(path.join(ROOT, 'raw/allocated.json'), JSON.stringify(out, null, 0));
  console.log('');
  console.log('wrote raw/allocated.json');
}

main();
