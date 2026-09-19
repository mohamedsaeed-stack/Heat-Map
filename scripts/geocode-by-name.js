'use strict';
// Last locating route: ask Nominatim for the business BY NAME.
//
// Nominatim indexes more than the Overpass tag families pulled by
// pull-osm-named.js, and it does its own fuzzy matching, so it finds businesses
// a strict name join misses. Free, one request per second.
//
// THE DANGER, and the guard against it: a free-text search almost always
// returns SOMETHING. Ask for "Acme Trading LLC, Dubai" and Nominatim will
// happily hand back the centre of Dubai. Accepting that would scatter invented
// pins across the city and look exactly like the predecessor demo's fake data.
// So a result is only accepted when the place it names actually shares a
// distinctive word with the company. Everything else is recorded as a miss.
//
// Order: closed won, then in process, then closed lost, then the rest. The
// layers that matter get located first, so the run is useful whenever it stops.
//
//   node scripts/geocode-by-name.js [maxRequests]

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CACHE = path.join(ROOT, 'raw', 'name-geocodes.json');
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const UA = 'flapkap-heatmap/0.1 (mohamed.saeed@flapkap.com)';
const DELAY_MS = 1100;
const BOX = { minLat: 24.70, maxLat: 25.45, minLng: 54.80, maxLng: 56.30 };
const VIEWBOX = '54.80,25.45,56.30,24.70';

const sleep = ms => new Promise(r => setTimeout(r, ms));

const map = read('data/map.json');

// Only the ones still unplaced, ordered by how much the layer matters.
const RANK = { closed_won: 0, in_process: 1, closed_lost: 2, crm: 3 };
const todo = map.companies
  .filter(c => c.y == null && c.n && c.n !== '(no name)')
  .sort((a, b) => (RANK[a.l] ?? 9) - (RANK[b.l] ?? 9));

const NOISE = new Set(['llc','fze','fzco','fzc','fz','dmcc','est','co','company','ltd','limited',
  'group','general','trading','uae','dubai','emirates','middle','east','international','the','and',
  'new','deal','branch','llp','sole','proprietorship','difc','holding','holdings','inc','trdg']);

function toks(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter(t => t.length > 2 && !NOISE.has(t));
}

// Does the place Nominatim returned actually look like this company?
function plausible(companyName, hit) {
  const want = toks(companyName);
  if (!want.length) return false;
  // Only the first component of the display name is the place itself; the rest
  // is the street, area, city. A match on "Dubai" means nothing.
  const head = String(hit.display_name || '').split(',')[0];
  const got = new Set(toks(head).concat(toks(hit.name)));
  if (!got.size) return false;
  let hits = 0;
  for (const t of want) if (got.has(t)) hits++;
  // one long distinctive word, or two ordinary ones
  if (hits >= 2) return true;
  if (hits === 1 && want.some(t => got.has(t) && t.length >= 6)) return true;
  return false;
}

async function search(name) {
  const url = 'https://nominatim.openstreetmap.org/search?' + new URLSearchParams({
    q: name + ', Dubai, United Arab Emirates',
    format: 'jsonv2', limit: '3', countrycodes: 'ae',
    viewbox: VIEWBOX, bounded: '1', addressdetails: '0',
  });
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

(async () => {
  const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
  const budget = Number(process.argv[2] || 3000);
  const queue = todo.filter(c => cache[c.i] === undefined).slice(0, budget);

  console.log('unplaced with a name  ' + todo.length.toLocaleString('en-US'));
  console.log('already tried         ' + Object.keys(cache).length.toLocaleString('en-US'));
  console.log('this run              ' + queue.length.toLocaleString('en-US') +
    '  (about ' + Math.ceil(queue.length * DELAY_MS / 60000) + ' minutes)');
  console.log('');

  let hit = 0, refused = 0, none = 0, err = 0, n = 0;
  for (const c of queue) {
    try {
      const rows = await search(c.n);
      let accepted = null;
      for (const r of rows) {
        const lat = Number(r.lat), lng = Number(r.lon);
        if (lat < BOX.minLat || lat > BOX.maxLat || lng < BOX.minLng || lng > BOX.maxLng) continue;
        if (!plausible(c.n, r)) continue;
        accepted = { lat, lng, osm: r.osm_type + '/' + r.osm_id, matchedName: String(r.display_name).split(',')[0] };
        break;
      }
      if (accepted) { cache[c.i] = accepted; hit++; }
      else if (rows.length) { cache[c.i] = null; refused++; }
      else { cache[c.i] = null; none++; }
    } catch (e) {
      err++;
      if (err > 30) { console.log('too many errors, stopping: ' + e.message); break; }
    }
    n++;
    if (n % 50 === 0) {
      fs.writeFileSync(CACHE, JSON.stringify(cache));
      console.log(n + '/' + queue.length + '   located ' + hit + '  refused ' + refused +
        '  nothing ' + none + '  err ' + err);
    }
    await sleep(DELAY_MS);
  }
  fs.writeFileSync(CACHE, JSON.stringify(cache));

  console.log('');
  console.log('located            ' + hit);
  console.log('refused as wrong   ' + refused + '  (Nominatim returned a place that is not this business)');
  console.log('nothing returned   ' + none);
  console.log('errors             ' + err);
  console.log('cache holds ' + Object.keys(cache).length + ' companies, ' +
    Object.values(cache).filter(Boolean).length + ' with coordinates');
})();
