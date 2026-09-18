'use strict';
// Assemble page/index.html from page/index.src.html by inlining the vendor
// stylesheets.
//
// Why this build step exists: the published-artifact viewer's content security
// policy BLOCKS external stylesheets. Scripts from cdnjs load fine, and Google
// Fonts is the one stylesheet host allowed, but Leaflet's and
// Leaflet.markercluster's CSS must be inlined or the map renders as a pile of
// unpositioned tiles with no visible error.
//
// Leaflet's CSS also references images relatively (marker-icon.png, layers.png).
// Once inlined, those resolve against the artifact origin and 404 - which is why
// the page uses L.circleMarker and L.divIcon only, and never a default marker.
//
//   node scripts/build-page.js
//
// page/index.src.html is the file to EDIT. page/index.html is generated and is
// what gets published.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'page', 'index.src.html');
const OUT = path.join(ROOT, 'page', 'index.html');
const VENDOR = path.join(ROOT, 'page', 'vendor');

const SHEETS = [
  { file: 'leaflet.min.css', url: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css' },
  { file: 'MarkerCluster.css', url: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.css' },
  { file: 'MarkerCluster.Default.css', url: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.Default.css' },
];

(async () => {
  fs.mkdirSync(VENDOR, { recursive: true });

  const parts = [];
  for (const s of SHEETS) {
    const local = path.join(VENDOR, s.file);
    if (!fs.existsSync(local)) {
      const res = await fetch(s.url);
      if (!res.ok) throw new Error('could not fetch ' + s.url + ': HTTP ' + res.status);
      fs.writeFileSync(local, await res.text());
      console.log('fetched ' + s.file);
    }
    const css = fs.readFileSync(local, 'utf8');
    parts.push('/* ' + s.file + ' - inlined because the artifact viewer blocks external stylesheets */\n' + css);
  }

  let html = fs.readFileSync(SRC, 'utf8');
  if (!html.includes('<!--VENDOR_CSS-->')) throw new Error('page/index.src.html has no <!--VENDOR_CSS--> marker');
  html = html.replace('<!--VENDOR_CSS-->', '<style>\n' + parts.join('\n') + '\n</style>');

  // Guard: nothing but Google Fonts may remain as an external stylesheet.
  const links = html.match(/<link[^>]*rel=["']stylesheet["'][^>]*>/g) || [];
  const bad = links.filter(l => !/fonts\.googleapis\.com/.test(l));
  if (bad.length) throw new Error('external stylesheet that the viewer will block:\n  ' + bad.join('\n  '));

  // Guard: scripts must come from the CDN allowlist.
  const scripts = (html.match(/<script[^>]*src=["']([^"']+)["']/g) || [])
    .map(s => s.match(/src=["']([^"']+)["']/)[1]);
  const badScripts = scripts.filter(s => !/^https:\/\/(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net\/npm\/)/.test(s));
  if (badScripts.length) throw new Error('script from a host the viewer blocks:\n  ' + badScripts.join('\n  '));

  fs.writeFileSync(OUT, html);

  console.log('built page/index.html  ' + (html.length / 1024).toFixed(1) + ' KB');
  console.log('  external stylesheets: ' + links.length + ' (Google Fonts only)');
  console.log('  external scripts:     ' + scripts.length);
  scripts.forEach(s => console.log('    ' + s));
})();
