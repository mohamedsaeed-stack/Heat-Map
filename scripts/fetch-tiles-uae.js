'use strict';
// Download OpenStreetMap tiles for the WHOLE UAE and keep them on disk, so the
// map is embedded in the html and needs no network at all.
//
// Why the Dubai tile set could not simply be widened:
//   Dubai alone is 284 tiles / 4.3 MB, which becomes ~5.9 MB once base64'd into
//   the page. Covering seven emirates at the same depth would be roughly 1,750
//   tiles and about 35 MB of page - the publish limit is 16 MB. So the tile set
//   is TIERED instead of uniform:
//
//     z6-z9    the whole country, so the opening view is a real map
//     z10-z11  the populated corridors, where the pins actually are
//     z12-z13  only the two dense cores, Dubai and Abu Dhabi city
//
//   Empty desert gets no deep tiles, because nothing is drawn there.
//
// OpenStreetMap tile policy: bulk downloading is discouraged and MORE THAN 250
// TILES AT ZOOM 13 OR DEEPER IS FORBIDDEN. This script refuses to run if the
// plan breaks that. Identifying User-Agent, 4 requests per second, one-off
// snapshot.  https://operations.osmfoundation.org/policies/tiles/
//
//   node scripts/fetch-tiles-uae.js [--plan]     --plan prints the budget only

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'raw', 'tiles');

const UA = 'flapkap-heatmap/0.2 (mohamed.saeed@flapkap.com)';
const DELAY_MS = 250;

// Each box is fetched only at its own zooms.
const BOXES = [
  { name: 'UAE whole country', zooms: [6, 7, 8, 9],
    minLat: 22.40, maxLat: 26.20, minLng: 51.00, maxLng: 56.60 },

  // The northern corridor: Dubai, Sharjah, Ajman, Umm Al Quwain, Ras Al Khaimah.
  { name: 'Northern corridor', zooms: [10, 11],
    minLat: 24.90, maxLat: 26.10, minLng: 54.80, maxLng: 56.20 },

  // Abu Dhabi city and its industrial belt, plus Al Ain.
  { name: 'Abu Dhabi + Al Ain', zooms: [10, 11],
    minLat: 24.00, maxLat: 24.75, minLng: 54.20, maxLng: 55.90 },

  // East coast: Fujairah, Khorfakkan, Dibba.
  { name: 'East coast', zooms: [10, 11],
    minLat: 25.00, maxLat: 25.75, minLng: 56.00, maxLng: 56.45 },

  // Deep zoom, strictly rationed - these are the only z12/z13 tiles.
  { name: 'Dubai core (deep)', zooms: [12, 13],
    minLat: 25.00, maxLat: 25.34, minLng: 55.05, maxLng: 55.45 },
  { name: 'Abu Dhabi core (deep)', zooms: [12, 13],
    minLat: 24.40, maxLat: 24.53, minLng: 54.32, maxLng: 54.53 },

  // 20 Sep 2026: the other cities were grey past z11. One zoom deeper for each,
  // and z13 for Al Ain's centre only. Still inside the 250-tile z13 budget.
  { name: 'Al Ain city', zooms: [12],
    minLat: 24.14, maxLat: 24.30, minLng: 55.62, maxLng: 55.86 },
  { name: 'Al Ain centre (deep)', zooms: [13],
    minLat: 24.19, maxLat: 24.25, minLng: 55.72, maxLng: 55.80 },
  { name: 'Sharjah + Ajman core', zooms: [12],
    minLat: 25.28, maxLat: 25.44, minLng: 55.36, maxLng: 55.58 },
  { name: 'Ras Al Khaimah city', zooms: [12],
    minLat: 25.74, maxLat: 25.84, minLng: 55.92, maxLng: 56.04 },
  { name: 'Fujairah city', zooms: [12],
    minLat: 25.08, maxLat: 25.18, minLng: 56.30, maxLng: 56.38 },
  { name: 'Umm Al Quwain', zooms: [12],
    minLat: 25.50, maxLat: 25.60, minLng: 55.52, maxLng: 55.62 },
];

const lon2x = (lon, z) => Math.floor((lon + 180) / 360 * Math.pow(2, z));
const lat2y = (lat, z) => {
  const r = lat * Math.PI / 180;
  return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, z));
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

function plan() {
  const seen = new Set();
  const wanted = [];
  for (const b of BOXES) {
    let n = 0;
    for (const z of b.zooms) {
      const x0 = lon2x(b.minLng, z), x1 = lon2x(b.maxLng, z);
      const y0 = lat2y(b.maxLat, z), y1 = lat2y(b.minLat, z);
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
        const k = z + '_' + x + '_' + y;
        if (seen.has(k)) continue;
        seen.add(k); wanted.push({ z, x, y }); n++;
      }
    }
    console.log('  ' + b.name.padEnd(24) + 'z' + b.zooms.join(',') + '  ->  ' + n + ' new tiles');
  }
  return wanted;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  console.log('TILE PLAN');
  const wanted = plan();

  const byZoom = {};
  for (const t of wanted) byZoom[t.z] = (byZoom[t.z] || 0) + 1;
  console.log('');
  console.log('  per zoom: ' + Object.entries(byZoom).map(([z, n]) => 'z' + z + '=' + n).join('  '));

  const deep = wanted.filter(t => t.z >= 13).length;
  console.log('  total ' + wanted.length + ' tiles, ' + deep + ' at z13+');
  const estMB = wanted.length * 15 / 1024;
  console.log('  estimated ' + estMB.toFixed(1) + ' MB on disk, ~' +
    (estMB * 1.37).toFixed(1) + ' MB once base64 in the page');

  if (deep > 250) {
    console.log('');
    console.log('! ' + deep + ' tiles at z13+ breaks the OpenStreetMap tile policy (max 250).');
    console.log('! Shrink a deep box. Refusing to run.');
    process.exit(1);
  }
  if (process.argv.includes('--plan')) return;
  console.log('');

  let got = 0, cached = 0, failed = 0;
  for (const t of wanted) {
    const file = path.join(OUT, t.z + '_' + t.x + '_' + t.y + '.png');
    if (fs.existsSync(file) && fs.statSync(file).size > 300) { cached++; continue; }
    try {
      const res = await fetch('https://tile.openstreetmap.org/' + t.z + '/' + t.x + '/' + t.y + '.png',
        { headers: { 'User-Agent': UA, 'Accept': 'image/png' } });
      if (!res.ok) { failed++; }
      else { fs.writeFileSync(file, Buffer.from(await res.arrayBuffer())); got++; }
    } catch (e) { failed++; }
    if ((got + cached + failed) % 50 === 0) console.log('  ' + (got + cached + failed) + '/' + wanted.length);
    await sleep(DELAY_MS);
  }

  const files = fs.readdirSync(OUT).filter(f => f.endsWith('.png'));
  const bytes = files.reduce((s, f) => s + fs.statSync(path.join(OUT, f)).size, 0);
  console.log('');
  console.log('downloaded ' + got + ', already had ' + cached + ', failed ' + failed);
  console.log(files.length + ' tiles on disk, ' + (bytes / 1024 / 1024).toFixed(1) + ' MB');
  console.log('base64 in the html will be about ' + (bytes * 1.37 / 1024 / 1024).toFixed(1) + ' MB');
})();
