'use strict';
// Fetch a real centroid for each Dubai community from Nominatim (OpenStreetMap).
//
// Why this exists: 73% of Dubai CRM companies have no street address, so they
// are placed on their community instead. That needs a coordinate per community.
// PLAN.md forbids inventing coordinates, so every centroid here comes from OSM
// and carries the osm id that produced it.
//
// WHY THIS IS FUSSIER THAN IT LOOKS. A naive "first result wins" query is wrong
// in a way that does not announce itself. Measured on the first run, 19 Sep 2026:
//   Hatta      -> "Dubai-Hatta Road"  (a highway, 90km from the town)
//   Al Fahidi  -> "Sharaf DG"         (a metro station named after a sponsor)
//   Al Safa    -> "Garmin"            (a metro station, and in Al Quoz, not Al Safa)
//   13 of 90 results were transport features rather than areas.
// Each of those would have moved an entire community's worth of pins somewhere
// else on the map, with no error raised. So: only `place`, `boundary` and
// `landuse` features are accepted, and everything else is refused and recorded.
//
// Nominatim usage policy: max 1 request/second, identifying User-Agent, no
// parallel requests. Free. https://operations.osmfoundation.org/policies/nominatim/
//
//   node scripts/geocode-communities.js          resume, keep good cached results
//   node scripts/geocode-communities.js --redo   discard cached results and refetch

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LOOKUP = path.join(ROOT, 'lookups', 'dubai-communities.json');
const RAW = path.join(ROOT, 'raw', 'communities-geocoded.json');
const OUT = path.join(ROOT, 'data', 'communities.json');

const UA = 'flapkap-heatmap/0.1 (mohamed.saeed@flapkap.com)';
const DELAY_MS = 1100; // 1 req/s policy, plus headroom

// Dubai city. Hatta is an exclave outside this box and is handled by the
// unbounded second attempt.
const VIEWBOX = '54.85,25.40,55.70,24.70'; // left,top,right,bottom

// An area, not a bus stop. `place` covers suburb/neighbourhood/town/island,
// `boundary` covers administrative areas, `landuse` covers the industrial and
// commercial zones that several Dubai communities actually are.
const OK_CATEGORY = new Set(['place', 'boundary', 'landuse']);

// Dubai emirate as a whole, used only to sanity-check the unbounded retry.
const DUBAI_BOX = { minLat: 24.70, maxLat: 25.40, minLng: 54.85, maxLng: 56.30 };

// Alternative search strings for communities whose plain name resolves only to a
// metro station, a hotel or a road. Each was checked against the refusal log, not
// guessed: "Dubai Investment Park" hits a railway station first, "Al Aweer" a
// hotel, "Nad Al Hamar" a road. The override is a different QUERY, never a
// coordinate - the answer still comes from OSM.
const QUERY_OVERRIDES = {
  'Dubai Investment Park': ['Dubai Investments Park First, Dubai', 'Dubai Investment Park 1, Dubai'],
  'Dubai Sports City': ['Dubai Sports City, Dubailand, Dubai'],
  'Al Aweer': ['Al Awir First, Dubai', 'Al Awir, Dubai'],
  'Nad Al Hamar': ['Nadd Al Hamar, Dubai'],
  'Al Khail Gate': ['Al Khail Gate, Al Quoz, Dubai'],
  'Bluewaters Island': ['Bluewaters, Dubai'],
  'Al Thanyah': ['Al Thanyah First, Dubai', 'Al Thanyah Third, Dubai'],
  'Al Khabaisi': ['Al Khabaisi, Deira, Dubai', 'Al Khabisi, Dubai'],
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

function acceptable(hit) {
  return OK_CATEGORY.has(hit.category);
}

function inDubai(lat, lng) {
  return lat >= DUBAI_BOX.minLat && lat <= DUBAI_BOX.maxLat &&
         lng >= DUBAI_BOX.minLng && lng <= DUBAI_BOX.maxLng;
}

async function query(q, bounded) {
  const params = {
    q, format: 'jsonv2', limit: '10', countrycodes: 'ae', addressdetails: '1',
  };
  if (bounded) { params.viewbox = VIEWBOX; params.bounded = '1'; }
  const url = 'https://nominatim.openstreetmap.org/search?' + new URLSearchParams(params);
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

function shape(hit, how) {
  return {
    lat: Number(hit.lat),
    lng: Number(hit.lon),
    osm_type: hit.osm_type,
    osm_id: hit.osm_id,
    display_name: hit.display_name,
    category: hit.category,
    type: hit.type,
    how,
  };
}

// Returns a shaped hit, or { rejected: [...] } describing what was refused.
async function resolveCommunity(name) {
  const rejected = [];
  const queries = [name + ', Dubai, United Arab Emirates'].concat(QUERY_OVERRIDES[name] || []);
  let first = true;

  for (const q of queries) {
    if (!first) await sleep(DELAY_MS);
    first = false;

    // Attempt 1: inside the Dubai city box.
    let hits = await query(q, true);
    for (const h of hits) {
      if (acceptable(h)) return shape(h, 'bounded');
      rejected.push(h.category + '/' + h.type + ' "' + h.display_name.split(',')[0] + '"');
    }

    await sleep(DELAY_MS);

    // Attempt 2: anywhere in the UAE, but it must land inside Dubai emirate and
    // say Dubai in its address. This is what recovers Hatta.
    hits = await query(q, false);
    for (const h of hits) {
      if (!acceptable(h)) continue;
      const lat = Number(h.lat), lng = Number(h.lon);
      if (!inDubai(lat, lng)) { rejected.push('outside Dubai: ' + h.display_name.split(',')[0]); continue; }
      if (!/dubai/i.test(h.display_name)) { rejected.push('not in Dubai: ' + h.display_name.split(',')[0]); continue; }
      return shape(h, 'unbounded');
    }
  }

  return { rejected };
}

(async () => {
  const redo = process.argv.includes('--redo');
  const lookup = JSON.parse(fs.readFileSync(LOOKUP, 'utf8'));
  let cache = fs.existsSync(RAW) ? JSON.parse(fs.readFileSync(RAW, 'utf8')) : {};

  // Drop cached results that the stricter rule would now refuse.
  let purged = 0;
  if (redo) { cache = {}; }
  else {
    for (const [k, v] of Object.entries(cache)) {
      // a cached result the stricter rule would now refuse
      if (v && !OK_CATEGORY.has(v.category)) { delete cache[k]; purged++; continue; }
      // a cached miss for which an alternative query has since been written
      if (v === null && QUERY_OVERRIDES[k]) { delete cache[k]; purged++; }
    }
  }
  if (purged) console.log('purged ' + purged + ' cached results that were not place/boundary/landuse features');

  let hit = 0, miss = 0, cached = 0, errors = 0;

  for (const c of lookup.communities) {
    if (cache[c.name] !== undefined) { cached++; continue; }
    try {
      const r = await resolveCommunity(c.name);
      if (r.rejected) {
        cache[c.name] = null;
        miss++;
        console.log('MISS  ' + c.name + '   refused: ' + r.rejected.slice(0, 3).join(' | '));
      } else {
        cache[c.name] = r;
        hit++;
        console.log('ok    ' + c.name.padEnd(28) + r.lat.toFixed(5) + ',' + r.lng.toFixed(5) +
          '  ' + (r.category + '/' + r.type).padEnd(22) + '[' + r.osm_type + '/' + r.osm_id + '] ' + r.how);
      }
    } catch (e) {
      errors++;
      console.log('ERR   ' + c.name + '  ' + e.message);
    }
    fs.writeFileSync(RAW, JSON.stringify(cache, null, 2));
    await sleep(DELAY_MS);
  }

  const out = {
    _source: 'Nominatim / OpenStreetMap, queried ' + new Date().toISOString().slice(0, 10),
    _licence: 'OpenStreetMap contributors, ODbL',
    _accepted: 'Only OSM place, boundary and landuse features. Transport stops, shops and roads are ' +
               'refused, because a metro station named after a district is not that district.',
    _note: 'Centroids only. A company placed on a community sits at its community centroid, not at ' +
           'its own address. The page states that on every community figure.',
    communities: {},
  };
  for (const c of lookup.communities) {
    const r = cache[c.name];
    if (!r) continue;
    if (!inDubai(r.lat, r.lng)) { console.log('DROP  ' + c.name + ' outside Dubai: ' + r.lat + ',' + r.lng); continue; }
    out.communities[c.name] = {
      sector: c.sector,
      lat: Number(r.lat.toFixed(6)),
      lng: Number(r.lng.toFixed(6)),
      osm: r.osm_type + '/' + r.osm_id,
      osm_kind: r.category + '/' + r.type,
    };
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');

  const placed = Object.keys(out.communities).length;
  console.log('');
  console.log(hit + ' resolved, ' + miss + ' refused, ' + errors + ' errors, ' + cached + ' from cache');
  console.log('published ' + placed + ' of ' + lookup.communities.length + ' communities to data/communities.json');
  const absent = lookup.communities.map(c => c.name).filter(n => !out.communities[n]);
  if (absent.length) console.log('NO CENTROID (companies here stay unlocated): ' + absent.join(', '));
})();
