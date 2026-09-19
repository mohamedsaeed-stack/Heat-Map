'use strict';
// Geocode CRM street addresses with Nominatim (OpenStreetMap), free.
//
// Order matters: closed won first, then in process, then closed lost, then the
// rest. The valuable pins land first, so the map can be rebuilt at any point
// and already be useful rather than waiting ~80 minutes for the long tail.
//
// Nominatim policy: 1 request/second, identifying User-Agent, no parallel
// requests. https://operations.osmfoundation.org/policies/nominatim/
//
// Results are cached by normalised address, so duplicate addresses cost one
// request, and the run is resumable - stop it and start it again.
//
//   node scripts/geocode-addresses.js [maxRequests]

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CACHE = path.join(ROOT, 'raw', 'address-geocodes.json');

const UA = 'flapkap-heatmap/0.1 (mohamed.saeed@flapkap.com)';
const DELAY_MS = 1100;
// Dubai emirate, generous. Anything outside is refused rather than trusted.
const BOX = { minLat: 24.70, maxLat: 25.45, minLng: 54.80, maxLng: 56.30 };
const VIEWBOX = '54.80,25.45,56.30,24.70';

const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

const companies = read('raw/hubspot-companies.json');
const deals = read('raw/hubspot-deals.json');
const stageMap = read('lookups/stage-map.json');

const stageLayer = new Map();
for (const s of stageMap.stages) stageLayer.set(s.pipeline + '|' + s.stage_id, s.layer);
const rankByCompany = new Map();
for (const d of deals) {
  if (!d.company_id) continue;
  const l = stageLayer.get(d.pipeline_id + '|' + d.stage_id);
  const r = l === 'won' ? 4 : l === 'open' ? 3 : (l === 'lost_sales' || l === 'lost_risk') ? 2 : 0;
  rankByCompany.set(d.company_id, Math.max(rankByCompany.get(d.company_id) || 0, r));
}

// Unique addresses, each carrying the best priority of any company using it.
const byAddr = new Map();
for (const c of companies) {
  if (!c.address) continue;
  const key = c.address.trim().toLowerCase();
  if (!key || key.length < 4) continue;
  let pri = rankByCompany.get(c.hs_object_id) || 0;
  if (!pri && c.lifecyclestage === 'customer') pri = 4;
  if (!pri && c.lifecyclestage === 'opportunity') pri = 3;
  if (!pri && c.lifecyclestage === 'marketingqualifiedlead') pri = 1.5;
  const prev = byAddr.get(key);
  if (!prev || pri > prev.pri) byAddr.set(key, { raw: c.address.trim(), pri });
}

const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
const todo = [...byAddr.entries()]
  .filter(([k]) => cache[k] === undefined)
  .sort((a, b) => b[1].pri - a[1].pri);

const budget = Number(process.argv[2] || todo.length);

console.log('unique addresses      ' + byAddr.size);
console.log('already cached        ' + Object.keys(cache).length);
console.log('to do                 ' + todo.length + (budget < todo.length ? '  (this run: ' + budget + ')' : ''));
console.log('estimated minutes     ' + Math.ceil(Math.min(budget, todo.length) * DELAY_MS / 60000));
console.log('');

async function geocode(q) {
  const url = 'https://nominatim.openstreetmap.org/search?' + new URLSearchParams({
    q: q + ', Dubai, United Arab Emirates',
    format: 'jsonv2', limit: '1', countrycodes: 'ae',
    viewbox: VIEWBOX, bounded: '1',
  });
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const body = await res.json();
  if (!body.length) return null;
  const h = body[0];
  const lat = Number(h.lat), lng = Number(h.lon);
  if (lat < BOX.minLat || lat > BOX.maxLat || lng < BOX.minLng || lng > BOX.maxLng) return null;
  return { lat, lng, osm: h.osm_type + '/' + h.osm_id, kind: h.category + '/' + h.type };
}

(async () => {
  let hit = 0, miss = 0, err = 0, done = 0;
  for (const [key, { raw }] of todo) {
    if (done >= budget) break;
    try {
      const r = await geocode(raw);
      cache[key] = r;                       // null is a recorded miss, not a retry loop
      if (r) hit++; else miss++;
    } catch (e) {
      err++;
      if (err > 25) { console.log('too many errors, stopping: ' + e.message); break; }
    }
    done++;
    if (done % 25 === 0) {
      fs.writeFileSync(CACHE, JSON.stringify(cache));
      console.log(done + '/' + Math.min(budget, todo.length) + '   hit ' + hit + '  miss ' + miss + '  err ' + err);
    }
    await sleep(DELAY_MS);
  }
  fs.writeFileSync(CACHE, JSON.stringify(cache));
  console.log('');
  console.log('done. resolved ' + hit + ', no match ' + miss + ', errors ' + err);
  console.log('cache now holds ' + Object.keys(cache).length + ' addresses, ' +
    Object.values(cache).filter(Boolean).length + ' with coordinates');
})();
