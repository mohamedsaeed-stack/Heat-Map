'use strict';
// How many NAMED businesses OpenStreetMap holds per emirate, with the same tag
// set the universe layer uses - one cheap count query per emirate, no download.
// Answers "how much bigger would the universe be outside Dubai" before spending
// the pull. Overpass policy: real User-Agent, 9 s between requests.
//
//   node scripts/count-osm-universe.js

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const AREAS = JSON.parse(fs.readFileSync(path.join(ROOT, 'lookups/uae-emirate-areas.json'), 'utf8')).emirates;
const UA = 'flapkap-heatmap/0.1 (mohamed.saeed@flapkap.com)';
const ENDPOINT = 'https://overpass-api.de/api/interpreter';
const DELAY_MS = 9000;

// The union of every category filter in pull-osm-universe.js, named elements only.
const FILTERS = [
  '["amenity"~"^(restaurant|cafe|fast_food|bar|pub|food_court|ice_cream|biergarten|clinic|doctors|dentist|hospital|pharmacy|veterinary|fuel|car_wash)$"]',
  '["shop"]',
  '["tourism"~"^(hotel|guest_house|hostel|apartment|motel)$"]',
  '["healthcare"]',
  '["office"~"^(construction_company|architect|interior_design|engineer|surveyor|advertising_agency|marketing|public_relations|newspaper|graphic_design|company|wholesale|logistics)$"]',
  '["craft"]',
  '["man_made"="works"]',
  '["industrial"]',
  '["landuse"="industrial"]',
];

function query(relId) {
  const body = FILTERS.map(f => 'nwr' + f + '["name"](area.a);').join('\n');
  return '[out:json][timeout:180];\nrel(' + relId + ');map_to_area->.a;\n(\n' + body + '\n);\nout count;';
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const out = {};
  let first = true;
  for (const [em, a] of Object.entries(AREAS)) {
    if (!first) await sleep(DELAY_MS);
    first = false;
    const t0 = Date.now();
    try {
      const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'User-Agent': UA, 'Content-Type': 'text/plain' }, body: query(a.osm_id) });
      const j = await res.json();
      const el = (j.elements || [])[0];
      const n = el && el.tags ? Number(el.tags.total || el.tags.nodes) : null;
      out[em] = n;
      console.log(em.padEnd(18) + String(n).padStart(8) + '   (' + ((Date.now() - t0) / 1000).toFixed(1) + 's, HTTP ' + res.status + ')');
    } catch (e) {
      out[em] = null;
      console.log(em.padEnd(18) + '   error: ' + e.message);
    }
  }
  const total = Object.values(out).filter(n => typeof n === 'number').reduce((s, n) => s + n, 0);
  console.log(''.padEnd(18) + '--------');
  console.log('UAE (named, OSM)'.padEnd(18) + String(total).padStart(8));
  fs.writeFileSync(path.join(ROOT, 'lookups/osm-universe-counts.json'), JSON.stringify({ measured: new Date().toISOString().slice(0, 10), counts: out, total }, null, 2));
  console.log('wrote lookups/osm-universe-counts.json');
}

main();
