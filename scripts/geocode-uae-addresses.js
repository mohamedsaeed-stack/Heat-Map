'use strict';
// Geocode the street addresses of UAE companies, one request per second.
//
// Two guards, both paid for in the Dubai run:
//
//   1. GENERIC ADDRESSES ARE REFUSED. An address that is only "Dubai", "UAE" or
//      an emirate name geocodes to the centre of the city, and an early build
//      stacked 383 unrelated companies on one point that way. It reads as a
//      real cluster and it is not. Those records fall back to an area or
//      emirate scatter instead, which is honest about what is known.
//
//   2. THE RESULT MUST LAND INSIDE THE EMIRATE WE ALREADY BELIEVE IT IS IN.
//      Nominatim's first result is often not the place - Hatta resolved to a
//      road 90 km away. Every hit is tested against that emirate's real
//      bounding box and refused if it falls outside.
//
// Addresses are deduplicated before querying: "Sheikh Zayed Road" appears on
// many records and is worth exactly one request.
//
// Resumable - reloads its own output and skips what is already resolved.
//
//   node scripts/geocode-uae-addresses.js

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'raw/uae-address-geocodes.json');
const UA = 'FlapKap-Coverage-Map/1.0 (RevOps internal; mohamed.saeed@flapkap.com)';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const allocated = JSON.parse(fs.readFileSync(path.join(ROOT, 'raw/allocated.json'), 'utf8'));
const polys = JSON.parse(fs.readFileSync(path.join(ROOT, 'raw/uae-emirate-polygons.json'), 'utf8'));
const PLACES = JSON.parse(fs.readFileSync(path.join(ROOT, 'lookups/uae-places.json'), 'utf8'));

const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

// An address that says nothing more than a city or country is not an address.
const GENERIC = new Set();
for (const [em, def] of Object.entries(PLACES.emirates)) {
  GENERIC.add(norm(em));
  for (const a of def.aliases) GENERIC.add(norm(a));
}
for (const t of PLACES.uae_tokens) GENERIC.add(norm(t));
// The 24 Sep 2026 CRM refresh brought Arabic addresses. An emirate or country
// name in Arabic is as generic as in English.
for (const t of ['دبي', 'أبوظبي', 'أبو ظبي', 'ابوظبي', 'الشارقة', 'عجمان', 'الفجيرة', 'رأس الخيمة', 'راس الخيمة', 'أم القيوين', 'ام القيوين', 'العين', 'الإمارات', 'الامارات', 'الإمارات العربية المتحدة', 'الامارات العربية المتحدة']) GENERIC.add(norm(t));
// "Street 2", "شارع 4", "Road 12": a numbered street with no area is not an address.
// Every Dubai district has a Street 2; Nominatim picks one at random.
const BARE_STREET = /^(?:street|st|road|rd|avenue|ave|شارع|طريق)\s*\d+\s*[a-z]?$|^\d+\s*[a-z]?\s*(?:street|st|road|rd|شارع|طريق)$/i;

function isGeneric(addr) {
  const a = norm(addr).replace(/[.,]/g, '').trim();
  if (a.length < 6) return true;
  if (GENERIC.has(a)) return true;
  if (BARE_STREET.test(a)) return true;
  if (/^[\d\s\-\/]+$/.test(a)) return true;             // "12", "4-5": numbers alone
  // "dubai uae", "uae dubai" and friends carry no street information either.
  const words = a.split(' ').filter(Boolean);
  return words.every(w => [...GENERIC].some(g => g.split(' ').includes(w)));
}

function inBox(lat, lon, bbox) {
  // Nominatim bbox order: [south, north, west, east]
  const [s, n, w, e] = bbox;
  return lat >= s && lat <= n && lon >= w && lon <= e;
}

async function nominatim(q) {
  const url = 'https://nominatim.openstreetmap.org/search?' +
    new URLSearchParams({ q, format: 'json', limit: '3', countrycodes: 'ae' });
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' } });
      if (res.status === 429 || res.status >= 500) { await sleep(5000); continue; }
      if (!res.ok) return null;
      return await res.json();
    } catch (e) { await sleep(3000); }
  }
  return null;
}

async function main() {
  let done = {};
  try { done = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) {}

  // Dedupe: one request per (address, emirate) pair, not per company.
  const todo = new Map();
  let generic = 0;
  for (const c of allocated) {
    if (!c.address || !c.emirate) continue;
    if (isGeneric(c.address)) { generic++; continue; }
    const key = c.emirate + '|' + norm(c.address);
    if (!todo.has(key)) todo.set(key, { address: c.address, emirate: c.emirate });
  }

  const pending = [...todo.entries()].filter(([k]) => !(k in done));
  console.log('companies with an address   ' + allocated.filter(c => c.address && c.emirate).length);
  console.log('refused as generic          ' + generic);
  console.log('distinct address+emirate    ' + todo.size);
  console.log('already resolved            ' + (todo.size - pending.length));
  console.log('to fetch                    ' + pending.length + '   (~' + Math.round(pending.length * 1.1 / 60) + ' min)');
  console.log('');

  let ok = 0, refusedOutside = 0, miss = 0, n = 0;
  for (const [key, item] of pending) {
    n++;
    const bbox = polys[item.emirate] && polys[item.emirate].bbox;
    const q = item.address + ', ' + item.emirate + ', United Arab Emirates';
    const j = await nominatim(q);
    await sleep(1100);

    let chosen = null;
    if (Array.isArray(j)) {
      for (const r of j) {
        const lat = Number(r.lat), lon = Number(r.lon);
        if (bbox && !inBox(lat, lon, bbox)) continue;   // guard 2
        chosen = { lat, lon, cat: r.class + '/' + r.type, display_name: r.display_name };
        break;
      }
      if (!chosen && j.length) refusedOutside++;
    }
    if (chosen) { done[key] = chosen; ok++; }
    else { done[key] = { refused: j && j.length ? 'outside emirate' : 'no result' }; miss++; }

    if (n % 25 === 0) {
      fs.writeFileSync(OUT, JSON.stringify(done));
      console.log(n + '/' + pending.length + '  ok=' + ok + ' outside=' + refusedOutside + ' miss=' + miss);
    }
  }
  fs.writeFileSync(OUT, JSON.stringify(done));
  console.log('');
  console.log('DONE  resolved=' + ok + '  refused_outside_emirate=' + refusedOutside + '  no_result=' + miss);
}

main();
