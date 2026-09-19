'use strict';
// Download the OpenStreetMap tiles for Dubai and keep them on disk, so the map
// can be embedded IN the html file and needs no network at all.
//
// Why: the user has now twice opened the file in a viewer that blocks external
// images - the Claude app's file preview, and before that the published-artifact
// viewer. In both, the tiles silently fail and the map renders as pins floating
// on grey. Embedding the tiles removes that failure mode completely: the file
// shows a real street map wherever it is opened, online or not.
//
// OpenStreetMap tile usage policy: bulk downloading is discouraged and more than
// 250 tiles at zoom 13 or deeper is forbidden. This stays inside that - 165
// tiles at z13, 229 in total for one city - uses an identifying User-Agent, and
// runs at 4 requests per second. It is a one-off snapshot, not a scraper.
// https://operations.osmfoundation.org/policies/tiles/
//
//   node scripts/fetch-tiles.js

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'raw', 'tiles');

const UA = 'flapkap-heatmap/0.1 (mohamed.saeed@flapkap.com)';
const DELAY_MS = 250;

// The Dubai core, where essentially every pin is. Hatta is deliberately left
// out: covering it would multiply the tile count for two pins.
const BOX = { minLat: 24.93, maxLat: 25.38, minLng: 54.90, maxLng: 55.62 };
const ZOOMS = [10, 11, 12, 13];

const lon2x = (lon, z) => Math.floor((lon + 180) / 360 * Math.pow(2, z));
const lat2y = (lat, z) => {
  const r = lat * Math.PI / 180;
  return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, z));
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  const wanted = [];
  for (const z of ZOOMS) {
    const x0 = lon2x(BOX.minLng, z), x1 = lon2x(BOX.maxLng, z);
    const y0 = lat2y(BOX.maxLat, z), y1 = lat2y(BOX.minLat, z);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) wanted.push({ z, x, y });
    console.log('z' + z + ': ' + ((x1 - x0 + 1) * (y1 - y0 + 1)) + ' tiles');
  }
  console.log('total ' + wanted.length + ' tiles');
  if (wanted.filter(t => t.z >= 13).length > 250) {
    console.log('! more than 250 tiles at z13+. That is outside the OSM tile policy. Shrink the box.');
    process.exit(1);
  }
  console.log('');

  let got = 0, cached = 0, failed = 0;
  for (const t of wanted) {
    const file = path.join(OUT, t.z + '_' + t.x + '_' + t.y + '.png');
    if (fs.existsSync(file) && fs.statSync(file).size > 300) { cached++; continue; }
    try {
      const res = await fetch('https://tile.openstreetmap.org/' + t.z + '/' + t.x + '/' + t.y + '.png',
        { headers: { 'User-Agent': UA, 'Accept': 'image/png' } });
      if (!res.ok) { failed++; console.log('  HTTP ' + res.status + ' for ' + t.z + '/' + t.x + '/' + t.y); }
      else {
        fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
        got++;
        if (got % 25 === 0) console.log('  ' + (got + cached) + '/' + wanted.length);
      }
    } catch (e) { failed++; }
    await sleep(DELAY_MS);
  }

  const files = fs.readdirSync(OUT).filter(f => f.endsWith('.png'));
  const bytes = files.reduce((s, f) => s + fs.statSync(path.join(OUT, f)).size, 0);
  console.log('');
  console.log('downloaded ' + got + ', already had ' + cached + ', failed ' + failed);
  console.log(files.length + ' tiles on disk, ' + (bytes / 1024 / 1024).toFixed(1) + ' MB');
  console.log('base64 in the html will be about ' + (bytes * 1.37 / 1024 / 1024).toFixed(1) + ' MB');
})();
