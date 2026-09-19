'use strict';
// Fetch (a) the real boundary polygon of each emirate and (b) a centroid for
// every area in the gazetteer, from OpenStreetMap via Nominatim.
//
// Why polygons: companies with no street address are scattered INSIDE the real
// place they belong to, never at a guessed point. A bounding box would put pins
// in the sea off Dubai and inside Oman off Fujairah, so the actual polygon is
// used and every generated point is tested against it.
//
// The polygons never ship. Scattering happens at build time and the page only
// ever receives finished coordinates.
//
// Nominatim policy: 1 request per second, identifying User-Agent, no parallel
// requests. This script is resumable - it reloads its own output and skips
// anything already resolved, so an interrupted run costs nothing.
//
// The trap this guards against, measured in the Dubai run: Nominatim's first
// result is often not the place. Hatta resolved to a road 90 km away, Al Safa
// to a metro station. Only place / boundary / landuse / admin results are
// accepted; anything else is refused and recorded as refused.
//
//   node scripts/geocode-uae-places.js

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PLACES = JSON.parse(fs.readFileSync(path.join(ROOT, 'lookups/uae-places.json'), 'utf8'));
const OUT_POLY = path.join(ROOT, 'raw/uae-emirate-polygons.json');
const OUT_AREA = path.join(ROOT, 'raw/uae-area-centroids.json');

const UA = 'FlapKap-Coverage-Map/1.0 (RevOps internal; mohamed.saeed@flapkap.com)';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const ACCEPT_CLASS = new Set(['place', 'boundary', 'landuse', 'admin']);

async function nominatim(params) {
  const url = 'https://nominatim.openstreetmap.org/search?' + new URLSearchParams(params);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' } });
      if (res.status === 429 || res.status >= 500) { await sleep(5000); continue; }
      if (!res.ok) return null;
      return await res.json();
    } catch (e) { await sleep(3000); }
  }
  return null;
}

function load(f) {
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return {}; }
}

async function main() {
  // ---- (a) emirate polygons -------------------------------------------------
  const polys = load(OUT_POLY);
  for (const [em, def] of Object.entries(PLACES.emirates)) {
    if (polys[em] && polys[em].geojson) { console.log('poly  skip  ' + em); continue; }
    // "Dubai" alone resolves to the CITY. The emirate needs the explicit word.
    const q = em + ' Emirate, United Arab Emirates';
    const j = await nominatim({ q, format: 'json', polygon_geojson: '1', limit: '1' });
    await sleep(1100);
    const r = j && j[0];
    if (!r || !r.geojson) { console.log('poly  FAIL  ' + em); polys[em] = { refused: 'no geojson' }; continue; }
    polys[em] = {
      display_name: r.display_name, osm_id: r.osm_id, osm_type: r.osm_type,
      cat: r.class + '/' + r.type,
      centroid: [Number(r.lat), Number(r.lon)],
      bbox: r.boundingbox.map(Number),
      geojson: r.geojson,
    };
    const n = JSON.stringify(r.geojson).length;
    console.log('poly  ok    ' + em + '  ' + r.geojson.type + '  ' + (n / 1024).toFixed(0) + ' KB');
    fs.writeFileSync(OUT_POLY, JSON.stringify(polys));
  }

  // ---- (b) area centroids ---------------------------------------------------
  const areas = load(OUT_AREA);
  for (const [em, def] of Object.entries(PLACES.emirates)) {
    for (const area of def.areas || []) {
      const key = em + '|' + area;
      if (areas[key]) continue;
      const tries = [
        area + ', ' + em + ', United Arab Emirates',
        area + ', United Arab Emirates',
      ];
      let got = null;
      for (const q of tries) {
        const j = await nominatim({ q, format: 'json', limit: '3' });
        await sleep(1100);
        if (!Array.isArray(j)) continue;
        const ok = j.find(r => ACCEPT_CLASS.has(r.class));
        if (ok) { got = ok; break; }
      }
      if (!got) {
        areas[key] = { refused: 'no place/boundary/landuse result' };
        console.log('area  FAIL  ' + key);
      } else {
        areas[key] = {
          emirate: em, area,
          lat: Number(got.lat), lon: Number(got.lon),
          cat: got.class + '/' + got.type,
          display_name: got.display_name,
          bbox: got.boundingbox.map(Number),
        };
        console.log('area  ok    ' + key + '  ' + got.class + '/' + got.type);
      }
      fs.writeFileSync(OUT_AREA, JSON.stringify(areas));
    }
  }

  const okPoly = Object.values(polys).filter(p => p.geojson).length;
  const okArea = Object.values(areas).filter(a => !a.refused).length;
  console.log('');
  console.log('emirate polygons  ' + okPoly + ' / ' + Object.keys(PLACES.emirates).length);
  console.log('area centroids    ' + okArea + ' / ' + Object.keys(areas).length);
}

main();
