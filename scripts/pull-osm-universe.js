'use strict';
// Pull the market universe from OpenStreetMap through the free Overpass API.
//
// This is the one layer that needs no CRM connector and no vendor account, so it
// is what puts real businesses, with real coordinates, on a real map.
//
// Measured traps, already paid for once (lookups/osm-dubai-counts.tsv):
//   - a bare request gets HTTP 406. Overpass requires a real User-Agent.
//   - firing 14 requests 2s apart got throttled into empty 200 responses with no
//     error. Requests here are spaced DELAY_MS apart and each result is checked
//     for plausibility before it is cached.
//   - a bounding box for "Dubai" clips Sharjah. This uses the admin boundary
//     relation (admin_level 4) instead.
//
//   node scripts/pull-osm-universe.js                 Dubai
//   node scripts/pull-osm-universe.js --emirate "Abu Dhabi"
//   node scripts/pull-osm-universe.js --redo          ignore the cache

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const RAWDIR = path.join(ROOT, 'raw', 'osm');
const OUTDIR = path.join(ROOT, 'data');

// Measured 19 Sep 2026 against a known-answer query (restaurants in Dubai Emirate
// = 2,586). overpass.osm.ch returned 0 for both area syntaxes and is not used.
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const UA = 'flapkap-heatmap/0.1 (mohamed.saeed@flapkap.com)';
const DELAY_MS = 9000;   // measured: 2s gets throttled, 5-10s does not
const TIMEOUT = 300;     // Overpass-side timeout, seconds

// One entry per category. `filters` are OR-ed inside a single Overpass union, so
// each category costs exactly one request.
const CATEGORIES = [
  {
    key: 'hospitality_fnb',
    label: 'Hospitality & F&B',
    credible: true,
    filters: [
      '["amenity"~"^(restaurant|cafe|fast_food|bar|pub|food_court|ice_cream|biergarten)$"]',
      '["shop"~"^(bakery|coffee|confectionery|pastry|tea|deli)$"]',
      '["tourism"~"^(hotel|guest_house|hostel|apartment|motel)$"]',
    ],
  },
  {
    key: 'medical_healthcare',
    label: 'Medical clinics & healthcare',
    credible: true,
    filters: [
      '["amenity"~"^(clinic|doctors|dentist|hospital|pharmacy|veterinary)$"]',
      '["healthcare"]',
      '["shop"~"^(optician|hearing_aids|medical_supply|herbalist)$"]',
    ],
  },
  {
    key: 'auto_automotive',
    label: 'Auto parts & automotive trading',
    credible: true,
    filters: [
      '["shop"~"^(car_parts|car_repair|car|tyres|motorcycle|motorcycle_repair|car_rental)$"]',
      '["amenity"~"^(fuel|car_wash)$"]',
    ],
  },
  {
    key: 'retail',
    label: 'Retail',
    credible: true,
    // every shop, minus the sub-types already claimed by another category above
    filters: ['["shop"]'],
    excludeShops: new Set([
      'bakery', 'coffee', 'confectionery', 'pastry', 'tea', 'deli',
      'car_parts', 'car_repair', 'car', 'tyres', 'motorcycle', 'motorcycle_repair', 'car_rental',
      'optician', 'hearing_aids', 'medical_supply', 'herbalist',
      'hardware', 'doityourself', 'furniture', 'interior_decoration', 'kitchen',
      'bathroom_furnishing', 'tiles', 'paint', 'lighting', 'curtain', 'flooring', 'trade',
    ]),
  },
  {
    key: 'contracting_fitout',
    label: 'Contracting, fitouts, FFE',
    credible: false,
    filters: [
      '["office"~"^(construction_company|architect|interior_design|engineer|surveyor)$"]',
      '["craft"]',
      '["shop"~"^(hardware|doityourself|furniture|interior_decoration|kitchen|bathroom_furnishing|tiles|paint|lighting|curtain|flooring|trade)$"]',
    ],
  },
  {
    key: 'marketing_advertising',
    label: 'Marketing & advertising',
    credible: false,
    filters: ['["office"~"^(advertising_agency|marketing|public_relations|newspaper|graphic_design)$"]'],
  },
  {
    key: 'manufacturing_trading',
    label: 'Manufacturing & general trading',
    credible: false,
    filters: [
      '["man_made"="works"]',
      '["industrial"]',
      '["office"~"^(company|wholesale|logistics)$"]',
      '["landuse"="industrial"]["name"]',
    ],
  },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Area ids come from lookups/uae-emirate-areas.json, resolved once from Nominatim.
//
// Two ways of naming the area were tried first and both failed:
//   ["name:en"="Dubai"] matched nothing and returned 0 elements with no error -
//     the emirate relation does not carry that tag in the form assumed.
//   a regex search over relation["name"~"Dubai"] returned HTTP 504; it is far too
//     expensive to run against the whole planet.
// A literal area id costs Overpass nothing and cannot silently match the wrong
// thing. Note that "Dubai" in Nominatim resolves to the CITY; the emirate needed
// querying as "Dubai Emirate", which is what puts Hatta and Jebel Ali inside it.
const AREAS = JSON.parse(fs.readFileSync(path.join(ROOT, 'lookups', 'uae-emirate-areas.json'), 'utf8')).emirates;

function relIdFor(emirate) {
  const a = AREAS[emirate];
  if (!a) throw new Error('no area id for "' + emirate + '". Known: ' + Object.keys(AREAS).join(', '));
  return a.osm_id;
}

function buildQuery(emirate, cat) {
  const union = cat.filters.map(f => '  nwr' + f + '(area.a);').join('\n');
  return '[out:json][timeout:' + TIMEOUT + '];\n' +
    'rel(' + relIdFor(emirate) + ');map_to_area->.a;\n' +
    '(\n' + union + '\n);\n' +
    'out center tags;';
}

async function overpass(query) {
  let lastErr = null;
  for (const endpoint of ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'User-Agent': UA,
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ data: query }),
      });
      if (!res.ok) { lastErr = new Error('HTTP ' + res.status + ' from ' + endpoint); continue; }
      const text = await res.text();
      let json;
      try { json = JSON.parse(text); }
      catch (e) { lastErr = new Error('non-JSON reply from ' + endpoint + ': ' + text.slice(0, 160)); continue; }
      if (!json.elements) { lastErr = new Error('no elements key from ' + endpoint); continue; }
      if (json.elements.length === 0) { lastErr = new Error('0 elements from ' + endpoint + ' - treated as throttling, not as an answer'); continue; }
      return { json, endpoint };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('all endpoints failed');
}

// An OSM element becomes a universe place only if it has a name and a position.
// Unnamed features are real but useless on a coverage map: they cannot be matched
// to a CRM company, so they are counted and dropped, never shown as a business.
function toPlace(el, cat) {
  const tags = el.tags || {};
  const name = tags['name:en'] || tags.name;
  const lat = el.lat != null ? el.lat : (el.center && el.center.lat);
  const lon = el.lon != null ? el.lon : (el.center && el.center.lon);
  if (lat == null || lon == null) return null;
  if (!name) return { unnamed: true };

  if (cat.excludeShops && tags.shop && cat.excludeShops.has(tags.shop)) return { excluded: true };

  const kind = tags.amenity || tags.shop || tags.tourism || tags.healthcare ||
               tags.office || tags.craft || tags.man_made || tags.industrial || 'other';
  return {
    id: el.type[0] + el.id,
    n: name,
    y: Number(lat.toFixed(5)),
    x: Number(lon.toFixed(5)),
    k: kind,
  };
}

(async () => {
  const argv = process.argv.slice(2);
  const redo = argv.includes('--redo');
  const ei = argv.indexOf('--emirate');
  const emirate = ei >= 0 ? argv[ei + 1] : 'Dubai';

  fs.mkdirSync(RAWDIR, { recursive: true });
  fs.mkdirSync(OUTDIR, { recursive: true });

  const slug = emirate.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const summary = { _emirate: emirate, _pulled: new Date().toISOString().slice(0, 10), _source: 'OpenStreetMap via Overpass', _licence: 'OpenStreetMap contributors, ODbL', categories: {} };

  for (const cat of CATEGORIES) {
    const cacheFile = path.join(RAWDIR, slug + '-' + cat.key + '.json');
    let elements;

    if (!redo && fs.existsSync(cacheFile)) {
      elements = JSON.parse(fs.readFileSync(cacheFile, 'utf8')).elements;
      console.log('cache  ' + cat.key.padEnd(24) + elements.length + ' elements');
    } else {
      process.stdout.write('fetch  ' + cat.key.padEnd(24));
      try {
        const { json, endpoint } = await overpass(buildQuery(emirate, cat));
        elements = json.elements;
        fs.writeFileSync(cacheFile, JSON.stringify({ elements, _endpoint: endpoint, _at: new Date().toISOString() }));
        console.log(elements.length + ' elements  [' + endpoint.replace(/https:\/\/|\/api.*/g, '') + ']');
      } catch (e) {
        console.log('FAILED  ' + e.message);
        summary.categories[cat.key] = { label: cat.label, error: e.message, places: 0 };
        await sleep(DELAY_MS);
        continue;
      }
      await sleep(DELAY_MS);
    }

    const places = [];
    let unnamed = 0, excluded = 0;
    const seen = new Set();
    for (const el of elements) {
      const p = toPlace(el, cat);
      if (!p) continue;
      if (p.unnamed) { unnamed++; continue; }
      if (p.excluded) { excluded++; continue; }
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      places.push(p);
    }

    const outFile = path.join(OUTDIR, 'universe-' + slug + '-' + cat.key + '.json');
    fs.writeFileSync(outFile, JSON.stringify({
      emirate, category: cat.key, label: cat.label, credible: cat.credible,
      source: 'OpenStreetMap via Overpass', licence: 'OpenStreetMap contributors, ODbL',
      pulled: summary._pulled,
      named: places.length, unnamed_dropped: unnamed, reclassified_elsewhere: excluded,
      places,
    }));

    summary.categories[cat.key] = {
      label: cat.label, credible: cat.credible,
      elements: elements.length, places: places.length,
      unnamed_dropped: unnamed, reclassified_elsewhere: excluded,
      file: 'universe-' + slug + '-' + cat.key + '.json',
      bytes: fs.statSync(outFile).size,
    };
    console.log('       ' + ''.padEnd(24) + places.length + ' named places, ' + unnamed +
      ' unnamed dropped' + (excluded ? ', ' + excluded + ' belong to another category' : ''));
  }

  fs.writeFileSync(path.join(OUTDIR, 'universe-' + slug + '.json'), JSON.stringify(summary, null, 2) + '\n');

  const total = Object.values(summary.categories).reduce((s, c) => s + (c.places || 0), 0);
  const bytes = Object.values(summary.categories).reduce((s, c) => s + (c.bytes || 0), 0);
  console.log('');
  console.log(emirate + ': ' + total.toLocaleString('en-US') + ' named places across ' +
    Object.keys(summary.categories).length + ' categories, ' + (bytes / 1024 / 1024).toFixed(1) + ' MB of data files');
  const failed = Object.entries(summary.categories).filter(([, c]) => c.error);
  if (failed.length) { console.log('FAILED: ' + failed.map(([k, c]) => k + ' (' + c.error + ')').join('; ')); process.exitCode = 1; }
})();
