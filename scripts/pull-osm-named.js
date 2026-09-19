'use strict';
// Pull EVERY named place in Dubai from OpenStreetMap, not just the seven ICP
// categories.
//
// Why: 15,621 CRM companies have no usable address, so they cannot be geocoded.
// But almost all of them have a NAME, and OpenStreetMap knows the location of
// tens of thousands of named businesses in Dubai. Matching a company name to a
// named OSM place gives a real coordinate without an address, without a paid
// API, and without a single web request per company.
//
// This is the free version of what a Google Places lookup would do.
//
//   node scripts/pull-osm-named.js

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const RAWDIR = path.join(ROOT, 'raw', 'osm');
const OUT = path.join(ROOT, 'raw', 'osm-named.json');

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const UA = 'flapkap-heatmap/0.1 (mohamed.saeed@flapkap.com)';
const DELAY_MS = 9000;
const DUBAI_REL = 3766483;

// Split by tag family, because one combined query for every named object in the
// emirate times out.
const GROUPS = [
  { key: 'shop',      filter: '["name"]["shop"]' },
  { key: 'amenity',   filter: '["name"]["amenity"]' },
  { key: 'office',    filter: '["name"]["office"]' },
  { key: 'craft',     filter: '["name"]["craft"]' },
  { key: 'healthcare',filter: '["name"]["healthcare"]' },
  { key: 'tourism',   filter: '["name"]["tourism"]' },
  { key: 'leisure',   filter: '["name"]["leisure"]' },
  { key: 'company',   filter: '["name"]["building"~"^(commercial|retail|industrial|office|warehouse)$"]' },
  { key: 'industrial',filter: '["name"]["industrial"]' },
  { key: 'landuse',   filter: '["name"]["landuse"~"^(commercial|retail|industrial)$"]' },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function overpass(query) {
  let last = null;
  for (const ep of ENDPOINTS) {
    try {
      const res = await fetch(ep, {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Accept': 'application/json',
                   'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: query }),
      });
      if (!res.ok) { last = new Error('HTTP ' + res.status); continue; }
      const text = await res.text();
      let j; try { j = JSON.parse(text); } catch (e) { last = new Error('non-JSON'); continue; }
      if (!j.elements) { last = new Error('no elements'); continue; }
      if (!j.elements.length) { last = new Error('0 elements - treated as throttling'); continue; }
      return j;
    } catch (e) { last = e; }
  }
  throw last || new Error('all endpoints failed');
}

(async () => {
  fs.mkdirSync(RAWDIR, { recursive: true });
  const all = new Map();

  for (const g of GROUPS) {
    const cache = path.join(RAWDIR, 'named-' + g.key + '.json');
    let elements;
    if (fs.existsSync(cache)) {
      elements = JSON.parse(fs.readFileSync(cache, 'utf8')).elements;
      console.log('cache  ' + g.key.padEnd(12) + elements.length);
    } else {
      const q = '[out:json][timeout:300];\nrel(' + DUBAI_REL + ');map_to_area->.a;\n(nwr' + g.filter + '(area.a););\nout center tags;';
      process.stdout.write('fetch  ' + g.key.padEnd(12));
      try {
        const j = await overpass(q);
        elements = j.elements;
        fs.writeFileSync(cache, JSON.stringify({ elements }));
        console.log(elements.length);
      } catch (e) {
        console.log('FAILED ' + e.message);
        await sleep(DELAY_MS);
        continue;
      }
      await sleep(DELAY_MS);
    }

    for (const el of elements) {
      const t = el.tags || {};
      const name = t['name:en'] || t.name;
      if (!name) continue;
      const lat = el.lat != null ? el.lat : (el.center && el.center.lat);
      const lon = el.lon != null ? el.lon : (el.center && el.center.lon);
      if (lat == null || lon == null) continue;
      const id = el.type[0] + el.id;
      if (all.has(id)) continue;
      all.set(id, {
        id, n: name,
        y: Number(lat.toFixed(5)), x: Number(lon.toFixed(5)),
        k: t.shop || t.amenity || t.office || t.craft || t.healthcare || t.tourism ||
           t.leisure || t.industrial || t.building || t.landuse || 'place',
      });
    }
  }

  const places = [...all.values()];
  fs.writeFileSync(OUT, JSON.stringify(places));
  console.log('');
  console.log(places.length.toLocaleString('en-US') + ' distinct named places in Dubai');
  console.log('wrote ' + path.relative(ROOT, OUT) + '  ' +
    (fs.statSync(OUT).size / 1024 / 1024).toFixed(1) + ' MB');
})();
