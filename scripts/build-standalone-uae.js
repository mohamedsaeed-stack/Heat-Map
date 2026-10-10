'use strict';
// Build dist/flapkap-uae-map.html - ONE file, opens by double-click, all 7 emirates.
//
// Why a standalone file: the published-artifact viewer's content security policy
// blocks map tile images, so the map renders as an empty canvas there. A local
// file has no such policy. This is what the Abu Dhabi demo did, and the reason
// that demo looked like a real map.
//
// Leaflet, Leaflet.markercluster and the data are all inlined, so the file needs
// no server and no build step - only an internet connection for the map tiles.
//
//   node scripts/build-standalone.js

const fs = require('fs');
const path = require('path');

// Two targets from one generator, so the hosted map and the file people double-click
// can never drift apart in features:
//
//   node scripts/build-standalone-uae.js            -> dist/flapkap-uae-map.html
//     One file, opens offline, data inlined, tiles base64-embedded. For an artifact
//     viewer or an email attachment, where external images are blocked.
//
//   node scripts/build-standalone-uae.js --server   -> page/index.html + data/map-page.json
//     For Railway. The data is fetched over HTTP (the server gzips it) instead of
//     inlined, and tiles come from Esri at run time instead of being embedded. A
//     real server has no content-security policy stopping them, and embedding tiles
//     means bulk-downloading them, which is what got the office IP blocked by
//     OpenStreetMap on 8 Oct 2026.
//
// Everything between those two points - every layer, filter, popup and statistic -
// is shared, which is the whole reason this is one script and not two.
const SERVER = process.argv.includes('--server');

const ROOT = path.join(__dirname, '..');
const V = f => fs.readFileSync(path.join(ROOT, 'page', 'vendor', f), 'utf8');
const zlib = require('zlib');
const map = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'map-uae.json'), 'utf8'));

const pinned = map.companies.filter(c => c.y != null);

const LAYERS = [
  { key: 'closed_won',  label: 'Closed won',  color: '#0b8043', r: 9 },
  { key: 'in_process',  label: 'In process',  color: '#f5a623', r: 8 },
  { key: 'closed_lost', label: 'Closed lost', color: '#d93025', r: 7 },
  { key: 'crm',         label: 'On the CRM',  color: '#2f6fd6', r: 6 },   // blue, not grey: a CRM record is a real prospect
];
const CAT_COLOR = {
  hospitality_fnb: '#e8590c', medical_healthcare: '#1098ad', marketing_advertising: '#c2255c',
  auto_automotive: '#2f9e44', contracting_fitout: '#6741d9', retail: '#b58900',
  manufacturing_trading: '#ae3ec9', it_software: '#0b7285', other: '#7a8699', blank: '#9aa4b2',
};

// Every OpenStreetMap tile for the Dubai core, base64 in the file itself.
// This is the fix for the failure the user hit twice: a viewer that blocks
// external images leaves the map as pins on grey. Embedded tiles cannot be
// blocked, so the file shows a real street map anywhere, with or without a
// network.
const TILE_DIR = path.join(ROOT, 'raw', 'tiles');
const TILES = {};
// The page is locked to the UAE (23 Sep 2026), so a tile that never touches the
// country is dead weight: the generous country box reached into Oman, Saudi
// Arabia and the Gulf, and z6 sits below the shallowest zoom the lock allows.
const UAE_BBOX = { s: 22.6, n: 26.5, w: 51.4, e: 56.6 };
function tileTouchesUAE(z, x, y) {
  const n = Math.pow(2, z);
  const lonW = x / n * 360 - 180, lonE = (x + 1) / n * 360 - 180;
  const latN = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI;
  const latS = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 1) / n))) * 180 / Math.PI;
  return lonE > UAE_BBOX.w && lonW < UAE_BBOX.e && latN > UAE_BBOX.s && latS < UAE_BBOX.n;
}
let tilesSkipped = 0;
if (fs.existsSync(TILE_DIR)) {
  for (const f of fs.readdirSync(TILE_DIR)) {
    if (!f.endsWith('.png')) continue;
    const [z, x, y] = f.replace(/.png$/, '').split('_').map(Number);
    if (z < 7 || !tileTouchesUAE(z, x, y)) { tilesSkipped++; continue; }
    TILES[f.replace(/.png$/, '')] = fs.readFileSync(path.join(TILE_DIR, f)).toString('base64');
  }
  console.log('tiles embedded ' + Object.keys(TILES).length + ', skipped as outside the UAE or below z7: ' + tilesSkipped);
}

// The UAE set is 26,224 pins against Dubai's 18,866, and most fields are the
// same handful of strings repeated tens of thousands of times - "hospitality_fnb",
// "hubspot", "emirate", "Dubai". Left alone the page came to 15.4 MB against a
// 16 MB publish limit, with the tiles alone taking 8.8 MB of that.
//
// So the repeated fields are dictionary-encoded to integers here and expanded
// back on load in the page. Every other line of page code sees the original
// shape and needed no change. Fields that are zero for most records are dropped
// entirely and defaulted on load.
const DICT = {};
for (const field of ['c', 'rt', 'src', 'h', 'e', 'l', 'o', 's', 'a']) {
  const vals = [];
  const idx = new Map();
  for (const c of pinned) {
    const v = c[field];
    if (v === undefined || v === null) continue;
    if (!idx.has(v)) { idx.set(v, vals.length); vals.push(v); }
    c[field] = idx.get(v);
  }
  if (vals.length) DICT[field] = vals;
}
// lc / ad / af are 0 on almost every record; drop the zeros.
let dropped = 0;
for (const c of pinned) {
  for (const k of ['lc', 'ad', 'af', 'd']) if (!c[k]) { delete c[k]; dropped++; }
}

const payload = {
  pulled: map.stats.pulled,
  companies: pinned,
  dict: DICT,
  universe: map.universe,
  stats: map.stats,
  categories: map.stats.categories,
  target: map.stats.targetCategories,
};

// The standalone file carries its own tiles and so offers one basemap at z15. The
// server build has no such limit, so it gets all three Esri layers - and none from
// tile.openstreetmap.org, whose usage policy forbids this kind of load and which
// now returns 403 to the office network.
// The standalone file has to carry Leaflet inside it - it is opened from disk with no
// network assumed. The server build loads it from cdnjs instead: the browser caches it
// across visits, the page stays small, and page/vendor/*.js is not in the repo anyway
// (only the CSS is), so inlining would make the server build impossible to run here.
const LEAFLET_JS = SERVER
  ? `<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/leaflet.markercluster.min.js"></script>`
  : `<script>${V('leaflet.min.js')}</script>
<script>${V('leaflet.markercluster.min.js')}</script>`;

// max is how far the user may zoom; nat is the deepest zoom the provider actually HAS
// tiles for. Leaflet upscales between the two, so going deeper gives a softer image
// instead of blank grey.
//
// nat values measured against Dubai Marina on 8 Oct 2026, not taken from Esri's docs:
// past its real depth every service returns HTTP 200 with an identical 2,521-byte
// blank JPEG, which looks like a working tile to any status-code check. Light Gray
// stops at 16, World Street Map at 17, World Imagery at 18. They were all set to 19,
// which is why zooming in went grey.
//
// Streets is World Street Map, not Light Gray Canvas: Light Gray is a backdrop with
// almost no labels, so zooming into a street showed no street name. Satellite gets a
// transparent labels layer on top for the same reason - imagery alone cannot tell you
// which road you are looking at.
const BASEMAPS_JS = SERVER ? `[
    {k:'streets',label:'Streets',max:20,nat:17,
     url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
     attr:'Esri, HERE, Garmin &middot; data &copy; OpenStreetMap contributors'},
    {k:'detailed',label:'Detailed',max:20,nat:16,
     url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
     attr:'Esri, HERE, Garmin &middot; data &copy; OpenStreetMap contributors'},
    {k:'satellite',label:'Satellite',max:20,nat:18,
     url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
     ref:'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
     attr:'Esri, Maxar, Earthstar Geographics &middot; data &copy; OpenStreetMap contributors'}
  ]` : `[
    {k:'streets',label:'Streets',url:'https://tile.openstreetmap.org/{z}/{x}/{y}.png',max:15,
     attr:'&copy; OpenStreetMap contributors'},
  ]`;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FlapKap &mdash; UAE Coverage Map</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600&display=swap" rel="stylesheet">
<style>
${V('leaflet.min.css')}
${V('MarkerCluster.css')}
${V('MarkerCluster.Default.css')}
</style>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  :root{color-scheme:dark}
  html,body{height:100%}
  body{font-family:Montserrat,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#050505;color:#A0A0AB;overflow:hidden}
  /* FlapKap design system, dark mode: canvas #050505, cards #18181B with #3F3F46 hairlines, body #A0A0AB, headings white at weight 400, blue #2970FF accent. */

  .header{background-color:#050505;background-image:radial-gradient(ellipse 48% 260% at 6% 50%,rgba(41,112,255,.22),rgba(0,187,185,.06) 55%,transparent 80%);border-bottom:1px solid #3F3F46;padding:0 1.5rem;display:flex;align-items:center;
    justify-content:space-between;gap:14px;position:absolute;top:0;left:0;right:0;height:52px;z-index:1200}
  .h-brand{display:flex;align-items:center;gap:1rem;min-width:0}
  .h-logo{height:22px;width:auto;flex-shrink:0;display:block}
  .h-title{font-size:16px;font-weight:400;color:#fff;white-space:nowrap;letter-spacing:.01em}
  .h-sub{font-size:11px;color:#A0A0AB;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .legend{display:flex;gap:14px;align-items:center;flex-wrap:wrap}
  .lg{display:flex;align-items:center;gap:6px;font-size:12px;color:#A0A0AB;cursor:pointer;user-select:none;white-space:nowrap}
  .lg .dot{width:13px;height:13px;border-radius:50%;border:2px solid #26272B;
    box-shadow:0 1px 3px rgba(0,0,0,.25);flex-shrink:0}
  .lg.off{opacity:.32}
  .lg .n{font-variant-numeric:tabular-nums;color:#70707B;font-size:11px}

  #map{position:absolute;top:52px;left:0;right:0;bottom:0}

  .stats{position:absolute;top:64px;left:.75rem;z-index:1000;display:flex;flex-direction:column;gap:.5rem}
  .stat{background:#18181B;border:1px solid #3F3F46;border-radius:1em;padding:9px 13px;min-width:148px}
  .stat .num{font-size:20px;font-weight:500;font-variant-numeric:tabular-nums;line-height:1.15}
  .stat .lbl{font-size:10.5px;color:#A0A0AB;margin-top:1px}
  .stat .amt{font-size:10.5px;color:#A0A0AB;margin-top:3px;font-variant-numeric:tabular-nums}

  .panel{position:absolute;top:64px;right:12px;z-index:1000;background:#18181B;border:1px solid #3F3F46;border-radius:1em;
    color:#A0A0AB;padding:.75rem;width:242px;font-size:12px;
    max-height:calc(100% - 80px);overflow-y:auto;scrollbar-width:thin;scrollbar-color:#3F3F46 #18181B}
  .panel h4{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#70707B;margin-bottom:6px;font-weight:500}
  .panel.hidden{display:none}
  .ptog{position:absolute;top:64px;right:266px;z-index:1001;width:22px;height:34px;border:1px solid #3F3F46;border-right:0;
    border-radius:8px 0 0 8px;background:#18181B;color:#A0A0AB;font:20px/30px sans-serif;cursor:pointer;padding:0;
    box-shadow:-2px 2px 6px rgba(0,0,0,.08)}
  .ptog.closed{right:0;border-right:1px solid #3F3F46;border-radius:8px 0 0 8px}
  .ptog:hover{color:#2970FF}
  .panel h4:not(:first-child){margin-top:1rem}
  .bmrow{display:flex;gap:4px}
  .bmrow{display:flex;gap:4px}
  .bm{flex:1;font:inherit;font-size:11px;padding:5px 4px;border:1px solid #3F3F46;background:transparent;
    border-radius:99px;cursor:pointer;color:#A0A0AB}
  .bm.on{background:#2970FF;border-color:#2970FF;color:#fff}
  .cats{display:flex;flex-wrap:wrap;gap:4px}
  .cat{font:inherit;font-size:10.5px;padding:3px 8px;border-radius:99px;border:1px solid #3F3F46;
    background:transparent;cursor:pointer;color:#A0A0AB;display:flex;align-items:center;gap:5px}
  .cat.on{color:#fff;border-color:transparent}
  .cat .cn{font-variant-numeric:tabular-nums;opacity:.85}
  .row{display:flex;align-items:center;gap:7px;padding:3px 0;font-size:11.5px;color:#A0A0AB;cursor:pointer}
  .row input{margin:0;accent-color:#2970FF}
  .muted{color:#70707B;font-size:10.5px;line-height:1.5;margin-top:8px}
  .muted b{color:#E4E4E7}

  .searchbox{width:100%;font:inherit;font-size:12px;padding:6px 11px;border:1px solid #3F3F46;border-radius:99px;background:#050505;color:#fff}
  .searchbox::placeholder{color:#70707B}
  .sel{width:100%;font:inherit;font-size:12px;padding:6px 8px;border:1px solid #3F3F46;border-radius:8px;background:#050505;color:#fff}
  .sel:focus,.searchbox:focus{outline:none;border-color:#2970FF}
  .sel option{background:#18181B;color:#E4E4E7}
  .msel{position:relative}
  .msel-btn{width:100%;display:flex;align-items:center;justify-content:space-between;gap:8px;font:inherit;font-size:12px;
    padding:6px 10px;border:1px solid #3F3F46;border-radius:8px;background:#050505;color:#fff;cursor:pointer;text-align:left}
  .msel-btn:hover,.msel.open .msel-btn{border-color:#2970FF}
  .msel-btn .sum{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .msel-btn .chev{flex-shrink:0;color:#A0A0AB;font-size:10px;transition:transform .15s}
  .msel.open .msel-btn .chev{transform:rotate(180deg)}
  .msel-pop{display:none;margin-top:4px;border:1px solid #3F3F46;border-radius:8px;background:#050505;padding:6px}
  .msel.open .msel-pop{display:block}
  .msel-tools{display:flex;gap:4px;align-items:center;margin-bottom:4px}
  .msel-tools button{font:inherit;font-size:10.5px;padding:2px 9px;border-radius:99px;border:1px solid #3F3F46;background:transparent;color:#A0A0AB;cursor:pointer}
  .msel-tools button:hover{border-color:#2970FF;color:#fff}
  .msel-find{flex:1;min-width:0;font:inherit;font-size:11px;padding:3px 8px;border:1px solid #3F3F46;border-radius:99px;background:#18181B;color:#fff}
  .msel-find::placeholder{color:#A0A0AB}
  .msel-list{max-height:200px;overflow-y:auto;scrollbar-width:thin;scrollbar-color:#3F3F46 #050505}
  .msel-row{display:flex;align-items:center;gap:7px;padding:3px 4px;border-radius:5px;font-size:11.5px;color:#D1D1D6;cursor:pointer}
  .msel-row:hover{background:#18181B}
  .msel-row input{margin:0;accent-color:#2970FF;flex-shrink:0}
  .msel-row .t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .msel-row .n{font-variant-numeric:tabular-nums;color:#A0A0AB;font-size:10.5px}
  .msel-row.hide{display:none}
  .hits{margin-top:5px;max-height:150px;overflow-y:auto}
  .hit{padding:4px 6px;border-radius:5px;cursor:pointer;font-size:11.5px;color:#D1D1D6}
  .hit:hover{background:#26272B}
  .hit i{font-style:normal;color:#70707B;font-size:10.5px}

  .note{position:absolute;left:12px;bottom:14px;z-index:1000;background:#18181B;border:1px solid #3F3F46;border-radius:1em;
    padding:9px 12px;max-width:390px;font-size:11px;color:#A0A0AB;
    border-left:3px solid #2970FF;line-height:1.5}
  .note b{color:#fff;font-weight:500}
  .note .x{float:right;cursor:pointer;color:#70707B;margin-left:8px;font-weight:600}
  .note.deepnote{top:12px;bottom:auto;left:50%;transform:translateX(-50%);border-left-color:#F79009;max-width:460px}

  .leaflet-popup-content-wrapper{border-radius:1em!important;background:#18181B!important;color:#A0A0AB!important;border:1px solid #3F3F46;box-shadow:0 8px 30px rgba(0,0,0,.5)!important}
  .leaflet-popup-tip{background:#18181B!important}
  .leaflet-container a.leaflet-popup-close-button{color:#A0A0AB!important}
  .leaflet-bar{border:1px solid #3F3F46!important;box-shadow:none!important}
  .leaflet-bar a{background:#18181B!important;color:#fff!important;border-bottom:1px solid #3F3F46!important}
  .leaflet-bar a:hover{background:#26272B!important}
  .leaflet-control-attribution{background:rgba(5,5,5,.75)!important;color:#70707B!important}
  .leaflet-control-attribution a{color:#84ADFF!important}
  .leaflet-popup-content{margin:12px 14px!important;font-family:inherit;min-width:210px}
  .pn{font-size:14px;font-weight:500;color:#fff;margin-bottom:3px;line-height:1.3}
  .pi{font-size:11px;color:#A0A0AB;margin-bottom:7px}
  .pb{display:inline-block;font-size:11px;font-weight:500;padding:3px 9px;border-radius:99px;color:#fff}
  .kv{display:grid;grid-template-columns:auto 1fr;gap:2px 10px;margin-top:8px;font-size:11.5px}
  .kv dt{color:#70707B}
  .kv dd{color:#E4E4E7;font-variant-numeric:tabular-nums}
  .pnote{font-size:10.5px;color:#A0A0AB;line-height:1.45;margin-top:8px;border-top:1px solid #3F3F46;padding-top:6px}
  .pid{font-size:11px;color:#A0A0AB;margin-top:5px}
  .pid a{color:#528BFF;text-decoration:none;font-weight:500}
  .pid a:hover{text-decoration:underline}
  .pid span{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:10px;color:#70707B;margin-left:6px}

  .lbl{background:rgba(24,24,27,.95);border:1px solid #3F3F46;border-radius:6px;
    padding:1px 6px;font-size:11px;color:#fff;font-weight:500;white-space:nowrap;
    box-shadow:0 1px 3px rgba(0,0,0,.15)}
  .lbl:before{display:none}
  .marker-cluster div{font-family:inherit;font-weight:600}

  .i{width:15px;height:15px;border-radius:50%;border:1px solid #3F3F46;background:transparent;color:#A0A0AB;
    font-size:10px;font-weight:700;line-height:1;cursor:pointer;padding:0;font-family:inherit;flex-shrink:0}
  .i:hover{border-color:#2970FF;color:#2970FF}
  .stat .lbl{display:flex;align-items:center;gap:5px;justify-content:space-between}
  dialog.info{border:1px solid #3F3F46;border-radius:1em;padding:0;max-width:520px;width:calc(100% - 32px);
    background:#18181B;color:#A0A0AB;box-shadow:0 12px 40px rgba(0,0,0,.6)}
  dialog.info::backdrop{background:rgba(0,0,0,.65)}
  .ih{padding:15px 18px 0;font-size:16px;font-weight:400;color:#fff}
  .ib{padding:8px 18px 14px;font-size:12.5px;color:#A0A0AB;line-height:1.55}
  .ib dt{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#70707B;font-weight:500;margin-top:12px}
  .ib dd{margin:3px 0 0}
  .ib code{display:block;background:#050505;border:1px solid #3F3F46;border-radius:6px;padding:7px 9px;
    font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11px;color:#E4E4E7;white-space:pre-wrap;
    margin-top:4px;line-height:1.45}
  .if{padding:0 18px 15px;text-align:right}
  .ibtn{font:inherit;font-size:12px;padding:6px 15px;border-radius:99px;background:#2970FF;color:#fff;border:0;cursor:pointer}

  /* Plan a visit day */
  details.plan{margin-top:1rem}
  details.plan>summary{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#70707B;font-weight:500;cursor:pointer;list-style:none;display:flex;align-items:center;gap:5px}
  details.plan>summary::-webkit-details-marker{display:none}
  details.plan>summary:before{content:'\\25B8';font-size:10px;transition:transform .15s}
  details.plan[open]>summary:before{transform:rotate(90deg)}
  details.plan>summary:hover{color:#A0A0AB}
  .plan-body{margin-top:7px}
  .prow2{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:5px}
  .pbtn{font:inherit;font-size:11px;padding:5px 11px;border-radius:99px;border:1px solid #3F3F46;background:transparent;color:#D1D1D6;cursor:pointer;text-decoration:none;display:inline-block}
  .pbtn:hover{border-color:#2970FF;color:#fff}
  .pbtn.pri{background:#2970FF;border-color:#2970FF;color:#fff}
  .pbtn.pri:hover{background:#528BFF}
  .pbtn.on{border-color:#F79009;color:#FDB022}
  .pbtn.block{display:block;text-align:center;margin-bottom:4px}
  .plist{max-height:230px;overflow-y:auto;margin:5px 0;scrollbar-width:thin;scrollbar-color:#3F3F46 #18181B}
  .pstop{display:flex;align-items:flex-start;gap:6px;padding:4px 2px;border-bottom:1px solid #26272B}
  .pstop input{margin:2px 0 0;accent-color:#2970FF;flex-shrink:0}
  .pstop.off .pname,.pstop.off .pno{opacity:.4}
  .pno{flex-shrink:0;min-width:16px;text-align:right;font-variant-numeric:tabular-nums;color:#70707B;font-size:11px;line-height:1.5}
  .pbody{min-width:0;flex:1}
  .pname{display:block;font-size:11.5px;color:#D1D1D6;cursor:pointer;line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .pname:hover{color:#fff;text-decoration:underline}
  .ptags{display:flex;flex-wrap:wrap;gap:3px;margin-top:2px;align-items:center;font-size:10px;color:#70707B}
  .pb2{display:inline-block;font-size:9.5px;font-weight:500;padding:1px 7px;border-radius:99px;color:#fff;line-height:1.5}
  .pb2.amb{background:transparent;border:1px solid #F79009;color:#FDB022;padding:0 6px}
  .pwarn{color:#FDB022}
  .rtn{width:18px;height:18px;border-radius:50%;background:#2970FF;border:1.5px solid #fff;color:#fff;font:600 10px/15px Montserrat,sans-serif;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.5)}
  .plan-drawing,.plan-drawing .leaflet-interactive{cursor:crosshair!important}

  @media(max-width:820px){
    .header{height:auto;padding:8px 12px;flex-direction:column;align-items:flex-start;gap:6px}
    #map{top:96px}
    .stats{top:108px;left:8px}
    .stat{min-width:120px;padding:6px 9px}
    .stat .num{font-size:16px}
    .panel{top:108px;right:8px;width:180px}
    .note{display:none}
    .note.deepnote{max-width:calc(100% - 24px)}
  }
</style>
</head>
<body>

<div class="header">
  <div class="h-brand">
    <svg class="h-logo" viewBox="0 0 134 38" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="FlapKap"><path d="M126.102 2.14084C124.312 2.14084 122.595 2.84269 121.329 4.09199C120.063 5.3413 119.352 7.03572 119.352 8.8025V15.5204H126.958C127.844 15.5329 128.724 15.3728 129.548 15.0494C130.372 14.7261 131.123 14.2457 131.759 13.6358C132.394 13.0259 132.902 12.2984 133.253 11.4949C133.603 10.6913 133.79 9.82747 133.803 8.95262V2.14084H126.102Z" fill="#00C8C8"/><path d="M129.284 5.88733H121.754C119.981 5.88733 118.281 6.5902 117.028 7.84132C115.774 9.09244 115.07 10.7893 115.07 12.5587V19.2676H127.119C128.892 19.2676 130.592 18.5647 131.845 17.3136C133.099 16.0625 133.803 14.3656 133.803 12.5963V5.88733H129.284Z" fill="#280CFF"/><path d="M14.4567 11.4346V9.79107C14.4567 9.18237 13.9697 8.6954 13.361 8.6954H3.07395C2.46525 8.6954 1.97828 9.18237 1.97828 9.79107V28.9043C1.97828 29.513 2.46525 30 3.07395 30H5.0218C5.6305 30 6.11746 29.513 6.11746 28.9043V21.6303H12.4784C13.0871 21.6303 13.5741 21.1434 13.5741 20.5347V18.8912C13.5741 18.2825 13.0871 17.7955 12.4784 17.7955H6.11746V12.5302H13.361C13.9697 12.5302 14.4567 12.0433 14.4567 11.4346ZM17.6381 9.79107V28.9043C17.6381 29.513 18.1251 30 18.7338 30H20.4381C21.0164 30 21.5034 29.513 21.5034 28.9043V9.79107C21.5034 9.18237 21.0164 8.6954 20.4381 8.6954H18.7338C18.1251 8.6954 17.6381 9.18237 17.6381 9.79107ZM36.6926 15.6651V16.3955C35.7187 15.1172 34.1665 14.2042 31.7622 14.2042C26.9838 14.2042 24.2447 18.252 24.2447 22.2999C24.2447 26.3173 26.9838 30.3652 31.7622 30.3652C34.1665 30.3652 35.7187 29.4522 36.6926 28.1739V28.9043C36.6926 29.513 37.1796 30 37.7883 30H39.4622C40.0709 30 40.5579 29.513 40.5579 28.9043V15.6651C40.5579 15.0563 40.0709 14.5694 39.4622 14.5694H37.7883C37.1796 14.5694 36.6926 15.0563 36.6926 15.6651ZM32.3709 26.6826C29.723 26.6826 28.2012 24.6434 28.2012 22.2999C28.2012 19.926 29.723 17.9173 32.3709 17.9173C35.0187 17.9173 36.5405 19.8955 36.5405 22.2999C36.5405 24.6739 35.0187 26.6826 32.3709 26.6826ZM52.9747 14.2042C50.6008 14.2042 49.0486 15.1172 48.0747 16.3955V15.6651C48.0747 15.0563 47.5877 14.5694 46.979 14.5694H45.2746C44.6964 14.5694 44.2094 15.0563 44.2094 15.6651V34.8088C44.2094 35.387 44.6964 35.874 45.2746 35.874H46.979C47.5877 35.874 48.0747 35.387 48.0747 34.8088V28.1739C49.0486 29.4522 50.6008 30.3652 52.9747 30.3652C57.7835 30.3652 60.5226 26.3173 60.5226 22.2999C60.5226 18.252 57.7835 14.2042 52.9747 14.2042ZM52.3965 26.6826C49.7182 26.6826 48.2269 24.6739 48.2269 22.2999C48.2269 19.8955 49.7182 17.9173 52.3965 17.9173C55.0443 17.9173 56.5661 19.926 56.5661 22.2999C56.5661 24.6434 55.0443 26.6826 52.3965 26.6826ZM79.483 28.9043L71.6612 19.1955L78.7526 9.79107C79.0874 9.33454 78.783 8.6954 78.2352 8.6954H75.5569C75.1308 8.6954 74.7047 8.90845 74.4612 9.24324L67.522 18.8303V9.79107C67.522 9.18237 67.0351 8.6954 66.4568 8.6954H64.4785C63.9002 8.6954 63.4133 9.18237 63.4133 9.79107V28.9043C63.4133 29.513 63.9002 30 64.4785 30H66.4568C67.0351 30 67.522 29.513 67.522 28.9043V20.0781L74.9482 29.4826C75.2221 29.8174 75.6178 30 76.0134 30H78.9352C79.5135 30 79.8178 29.3304 79.483 28.9043ZM93.2533 15.6651V16.3955C92.2793 15.1172 90.7271 14.2042 88.3228 14.2042C83.5445 14.2042 80.8053 18.252 80.8053 22.2999C80.8053 26.3173 83.5445 30.3652 88.3228 30.3652C90.7271 30.3652 92.2793 29.4522 93.2533 28.1739V28.9043C93.2533 29.513 93.7402 30 94.3489 30H96.0229C96.6316 30 97.1185 29.513 97.1185 28.9043V15.6651C97.1185 15.0563 96.6316 14.5694 96.0229 14.5694H94.3489C93.7402 14.5694 93.2533 15.0563 93.2533 15.6651ZM88.9315 26.6826C86.2836 26.6826 84.7619 24.6434 84.7619 22.2999C84.7619 19.926 86.2836 17.9173 88.9315 17.9173C91.5793 17.9173 93.1011 19.8955 93.1011 22.2999C93.1011 24.6739 91.5793 26.6826 88.9315 26.6826ZM109.535 14.2042C107.161 14.2042 105.609 15.1172 104.635 16.3955V15.6651C104.635 15.0563 104.148 14.5694 103.54 14.5694H101.835C101.257 14.5694 100.77 15.0563 100.77 15.6651V34.8088C100.77 35.387 101.257 35.874 101.835 35.874H103.54C104.148 35.874 104.635 35.387 104.635 34.8088V28.1739C105.609 29.4522 107.161 30.3652 109.535 30.3652C114.344 30.3652 117.083 26.3173 117.083 22.2999C117.083 18.252 114.344 14.2042 109.535 14.2042ZM108.957 26.6826C106.279 26.6826 104.787 24.6739 104.787 22.2999C104.787 19.8955 106.279 17.9173 108.957 17.9173C111.605 17.9173 113.127 19.926 113.127 22.2999C113.127 24.6434 111.605 26.6826 108.957 26.6826Z" fill="white"/></svg>
    <div style="min-width:0">
      <div class="h-title">UAE Coverage Map</div>
      <div class="h-sub" id="sub">&nbsp;</div>
    </div>
  </div>
  <div class="legend" id="legend"></div>
</div>

<div id="map"></div>
<div class="stats" id="stats"></div>

<button class="ptog" id="ptog" title="Hide the panel">&rsaquo;</button>
<div class="panel" id="panel">
  <h4>Find a business</h4>
  <input class="searchbox" id="q" placeholder="Type a name&hellip;" autocomplete="off">
  <div class="hits" id="hits"></div>

  <details class="plan" id="plan">
    <summary>Plan a visit day</summary>
    <div class="plan-body">
      <div class="prow2"><button class="pbtn pri" id="pdraw">Draw an area</button><button class="pbtn" id="pclear">Clear</button></div>
      <div class="muted" id="pmsg" style="margin-top:0">Switch on the layers you want in the legend, then drag a box over the area.</div>
      <div class="plist" id="plist"></div>
      <div class="prow2" id="pact" style="display:none"><button class="pbtn pri" id="porder">Order stops</button><button class="pbtn" id="ploc">Start from my location</button></div>
      <div class="muted" id="ptotal" style="display:none"></div>
      <div id="plinks" style="margin-top:6px"></div>
      <div class="prow2" id="pcsvrow" style="display:none;margin-top:4px"><button class="pbtn" id="pcsv">Download CSV</button></div>
      <div class="muted">Approximate stops are placed inside their area, not at the building &mdash; confirm the address before driving.</div>
    </div>
  </details>

  <h4>Base map</h4>
  <div class="bmrow" id="bms"></div>

  <h4>Display</h4>
  <label class="row"><input type="checkbox" id="heat"> Size pins by deal value</label>
  <label class="row"><input type="checkbox" id="cluster"> Group nearby pins</label>
  <div class="muted" id="drawnote" style="display:none;margin-top:4px"></div>

  <h4>Emirate</h4>
  <div class="msel" id="ems"></div>

  <h4 id="bookh" style="display:none">Outstanding book <button class="i" id="ibook" title="Why">i</button></h4>
  <div id="book" style="display:none"></div>

  <h4>Owner (HubSpot)</h4>
  <div class="msel" id="hsown"></div>

  <h4 id="ownh" style="display:none">Closed by (admin app)</h4>
  <div class="msel" id="own" style="display:none"></div>
  <div class="muted" id="ownnote" style="display:none;margin-top:4px">Tick fewer than all and the map shows only funded clients, by who closed them.</div>

  <h4>How exact is the pin?</h4>
  <div class="msel" id="prec"></div>
  <div class="muted" style="margin-top:4px">A solid dot with a white ring is a real street address. Faded, ringless pins are scattered inside the area or emirate we know the business is in &mdash; they are not the building.</div>

  <h4>Categories</h4>
  <div class="msel" id="cats"></div>

  <div class="muted" id="locnote"></div>
</div>

<div class="note" id="note"></div>
<div class="note deepnote" id="deepnote" style="display:none"></div>

<dialog class="info" id="dlg">
  <div class="ih" id="dlgh"></div>
  <div class="ib" id="dlgb"></div>
  <div class="if"><button class="ibtn" id="dlgx">Close</button></div>
</dialog>

${LEAFLET_JS}
<script>
// The pin data travels gzipped and base64-encoded (5.2 MB -> 1.6 MB, measured
// 23 Sep 2026) and is unpacked on open by the browser's built-in
// DecompressionStream - no library, identical output. Every current browser has
// it; an old one gets a plain message instead of a blank map.
var DATA_GZ = ${SERVER ? 'null' : `"${zlib.gzipSync(Buffer.from(JSON.stringify(payload)), { level: 9 }).toString('base64')}"`};
// Server build only: the same payload lives in data/map-page.json instead of in this
// file. serve.js gzips it on the way out, so the wire cost matches the inlined build
// while the page itself stays small enough to read and diff.
var DATA_URL = ${SERVER ? '"data/map-page.json"' : 'null'};
var DATA = null;
// Expand the dictionary-encoded fields back to their real values, so every
// other line below sees the same shape the Dubai build produced.
function __expand(){
  var D=DATA.dict||{}, C=DATA.companies, ks=Object.keys(D);
  for(var i=0;i<C.length;i++){
    var c=C[i];
    for(var j=0;j<ks.length;j++){ var k=ks[j]; if(typeof c[k]==='number') c[k]=D[k][c[k]]; }
    if(c.lc===undefined)c.lc=0; if(c.ad===undefined)c.ad=0;
    if(c.af===undefined)c.af=0; if(c.d===undefined)c.d=0;
  }
}</script>
<script>var TILES = ${SERVER ? '{}' : JSON.stringify(TILES)};</script>
<script>
function __main(){
  var LAYERS = ${JSON.stringify(LAYERS)};
  var CAT_COLOR = ${JSON.stringify(CAT_COLOR)};
  var BY_KEY = {}; LAYERS.forEach(function(l){ BY_KEY[l.key]=l; });

  // The offline street map stops at zoom 15: the sharpest embedded tiles are z13,
  // two levels of scaling is still a map, four is a blur - and approximate pins
  // do not justify street-level zoom. The online base maps keep their own maximum.
  // Source-record links. HubSpot portal 25308329. The admin app is a Flutter web
  // app with hash routing; its bundle declares the route /clients/:clientId, and
  // the sign-in page lands on /#/login - measured 22 Sep 2026 from the public
  // front-end, no login needed.
  var HUBSPOT_URL = 'https://app.hubspot.com/contacts/25308329/record/0-2/{id}';
  var ADMIN_CLIENT_URL = 'https://admin72913.flapkap.com/#/clients/{id}';
  var BASEMAPS = ${BASEMAPS_JS};
  var EMBEDDED = ${SERVER ? 'false' : 'true'};

  // Google Maps, by name: a text search for the company name plus the area and
  // emirate we know. Tested 6 Oct 2026 on a 20-pin sample across every tier:
  // this form opened the right listing every time. A search pinned to our own
  // coordinates did not (it snapped to a different florist when our geocode
  // was off), so coordinates are never passed. No API key, no cost.
  function gmapsUrl(name,area,emirate){
    if(!name) return null;   // a nameless record would search for the district alone
    var q=[name, area, (emirate && emirate!=='UAE') ? emirate : null, 'UAE'].filter(Boolean).join(', ');
    return 'https://www.google.com/maps/search/?api=1&amp;hl=en&amp;query='+encodeURIComponent(q);
  }
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];});}
  function fmt(n){return (n==null?0:n).toLocaleString('en-US');}
  function aed(n){
    if(n==null) return null;
    if(n>=1e6) return 'AED ' + (n/1e6).toFixed(n>=1e7?0:1) + 'M';
    if(n>=1e3) return 'AED ' + Math.round(n/1e3) + 'K';
    return 'AED ' + fmt(n);
  }

  // One shared canvas renderer for every pin. padding 0.5 pre-draws half a
  // viewport beyond each edge, so a pan of up to half a screen needs no redraw
  // at all (Leaflet's default 0.1 redraws almost every pan with 33k pins).
  var pinRenderer = L.canvas({padding:0.5, tolerance:3});
  var map = L.map('map',{zoomControl:true,preferCanvas:true,renderer:pinRenderer,maxBoundsViscosity:1.0}).setView([25.05,55.45],9);
  window.__map = map;   // for in-browser checks only (redraw timing, layer counts)
  // Locked to the UAE (23 Sep 2026): the view cannot leave the country, and the
  // shallowest zoom is the one that fits the whole country on this screen - so
  // there is only ever "zoom in". Re-computed when the window is resized.
  var UAE_BOUNDS=L.latLngBounds([22.6,51.4],[26.5,56.6]);
  map.setMaxBounds(UAE_BOUNDS.pad(0.03));
  // Zooming out past the country shows oceans and neighbouring states with no pins on
  // them, which reads as the map breaking. The floor is the zoom at which the UAE just
  // fills the window, recomputed on resize. The fixed 6 is a backstop for the case
  // lockZoom cannot run - a container with no size yet - where leaving minZoom at
  // Leaflet's default 0 let the map zoom out to the whole world.
  map.setMinZoom(6);
  function lockZoom(){ var sz=map.getSize(); if(sz.x>0&&sz.y>0){ var z=map.getBoundsZoom(UAE_BOUNDS); if(isFinite(z)) map.setMinZoom(z); } }
  map.on('resize',lockZoom);
  L.control.scale({imperial:false}).addTo(map);

  // Embedded first; where no tile exists at this zoom, the nearest coarser
  // embedded tile is scaled up rather than leaving grey (seen in Al Ain, 20 Sep
  // 2026: only Dubai and Abu Dhabi city had deep tiles). Network last.
  var EmbeddedTiles = L.TileLayer.extend({
    createTile: function(c, done){
      var k = c.z + '_' + c.x + '_' + c.y;
      if (TILES[k]) return L.TileLayer.prototype.createTile.call(this, c, done);
      var z = c.z, x = c.x, y = c.y, d = 0, pk = null;
      while (z > 6) {
        z--; x = Math.floor(x / 2); y = Math.floor(y / 2); d++;
        if (TILES[z + '_' + x + '_' + y]) { pk = z + '_' + x + '_' + y; break; }
      }
      if (!pk) return L.TileLayer.prototype.createTile.call(this, c, done);
      var size = this.getTileSize(), tile = document.createElement('canvas');
      tile.width = size.x; tile.height = size.y;
      var img = new Image();
      img.onload = function(){
        var n = Math.pow(2, d), sw = img.width / n, sh = img.height / n;
        var sx = (c.x - x * n) * sw, sy = (c.y - y * n) * sh;
        var ctx = tile.getContext('2d'); ctx.imageSmoothingEnabled = true;
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size.x, size.y);
        done(null, tile);
      };
      img.onerror = function(e){ done(e, tile); };
      img.src = 'data:image/png;base64,' + TILES[pk];
      return tile;
    },
    getTileUrl: function(c){
      var k = c.z + '_' + c.x + '_' + c.y;
      if (TILES[k]) return 'data:image/png;base64,' + TILES[k];
      return L.TileLayer.prototype.getTileUrl.call(this, c);
    }
  });
  var tileLayer=null,refLayer=null,curBase=null;
  function setBase(k){
    if(curBase===k) return;
    if(tileLayer) map.removeLayer(tileLayer);
    if(refLayer){ map.removeLayer(refLayer); refLayer=null; }
    var b=BASEMAPS.filter(function(x){return x.k===k;})[0];
    // maxNativeZoom 13 is the sharpest embedded tile; upscaling beyond that is still
    // a map. The server build fetches real tiles at every zoom, so it must NOT cap.
    tileLayer=((EMBEDDED&&b.k==='streets')
                 ?new EmbeddedTiles(b.url,{maxZoom:b.max,maxNativeZoom:13,attribution:b.attr})
                 // updateWhenZooming:false was tried for smoothness on 8 Oct and
                 // reverted the same day: suppressing tile updates mid-zoom is exactly
                 // what made zooming out flash grey gaps. keepBuffer alone is safe.
                 :L.tileLayer(b.url,{maxZoom:b.max,maxNativeZoom:b.nat||b.max,
                                     keepBuffer:3,attribution:b.attr})).addTo(map);
    // The map's ceiling must match THIS basemap, not the deepest of all of them. With
    // the map at 21 and a layer capped at 20, Leaflet hides the layer above 20 and the
    // map goes grey - which is what "it still goes grey when I zoom all the way in"
    // was. All three are 20 now, so the two can never disagree again.
    map.setMaxZoom(b.max);
    tileLayer.bringToBack();
    // Place names and roads over the imagery, so a satellite view can still be read.
    if(b.ref){
      refLayer=L.tileLayer(b.ref,{maxZoom:b.max,maxNativeZoom:b.nat,
                                  keepBuffer:3,opacity:.9,pane:'overlayPane'}).addTo(map);
      refLayer.bringToBack(); tileLayer.bringToBack();
    }
    curBase=k;
    Array.prototype.forEach.call(document.querySelectorAll('.bm'),function(el){
      el.className='bm'+(el.getAttribute('data-k')===k?' on':'');});
  }
  // Render the switcher from BASEMAPS rather than hard-coding buttons: the standalone
  // build ships one basemap and the server build three, and a hard-coded row would
  // show dead buttons in whichever build has fewer.
  (function(){
    var host=document.getElementById('bms');
    if(!host) return;
    if(BASEMAPS.length<2){ var h=host.previousElementSibling; if(h&&h.tagName==='H4') h.style.display='none'; host.style.display='none'; return; }
    host.innerHTML=BASEMAPS.map(function(b){
      return '<button class="bm" data-k="'+b.k+'">'+b.label+'</button>'; }).join('');
    Array.prototype.forEach.call(host.querySelectorAll('.bm'),function(el){
      el.onclick=function(){ setBase(el.getAttribute('data-k')); };});
  })();
  setBase('streets');

  var on={closed_won:true,in_process:true,closed_lost:true,crm:true,universe:false};
  var catOn={}; DATA.target.forEach(function(c){catOn[c]=true;}); catOn.other=true; catOn.blank=true;
  // Emirate filter, and a filter on HOW WELL a pin is located. The second one
  // matters: switching off "emirate only" leaves just the pins whose position
  // is actually meaningful, which is the honest view of the map.
  var EMIRATES=Object.keys(DATA.stats.byEmirate||{}).filter(function(k){return k!=='unplaced'&&k!=='not UAE';});
  var emOn={}; EMIRATES.forEach(function(e){emOn[e]=true;}); emOn.Unknown=true;
  var PREC=[['exact','Exact building'],['area','Area or street'],['emirate','Emirate only'],['uae','UAE — emirate unknown']];
  var precOn={exact:true,area:true,emirate:true,uae:true};
  // Owner filters: key -> bool, filled on first render. Every key true = no filter.
  var ownOn=null;     // commercial owner (admin app); key '__none' = funded, nobody assigned
  var hsOwnOn=null;   // HubSpot owner; key '__none' = no owner
  function allOn(m){ for(var k in m){ if(!m[k]) return false; } return true; }
  var showLabels=false, sizeByValue=false;

  function clusterIcon(bg){
    return function(cl){
      var n=cl.getChildCount(), s=n<10?32:n<100?38:46;
      return L.divIcon({className:'',iconSize:[s,s],
        html:'<div style="width:'+s+'px;height:'+s+'px;line-height:'+s+'px;border-radius:50%;background:'+bg+
        ';color:#fff;text-align:center;border:2px solid rgba(255,255,255,.92);box-shadow:0 2px 6px rgba(0,0,0,.35);'+
        'font-size:'+(n<100?12:11)+'px;font-weight:600">'+n+'</div>'});
    };
  }
  // EVERY PIN IS DRAWN BY DEFAULT. Clustering was the reason this did not look
  // like the Abu Dhabi demo: it replaces the coloured dots with big numbered
  // bubbles until you zoom right in, which reads as a chart, not a map. Canvas
  // rendering handles 3,000+ circle markers without it. Clustering stays as an
  // opt-in for the 18,000-point universe layer, where raw dots do become a mess.
  // Ungrouped mode draws every matching pin, and with 38,000 of them a plain
  // L.layerGroup hands all 38,000 to the canvas renderer on every pan and zoom -
  // which is exactly the drag the smaller Dubai page did not have. This group keeps
  // the full set in memory but only ever puts the ones inside the viewport (plus a
  // 30% margin, so a short pan has pins ready) on the map. Clustering already culls
  // this way internally; this gives the ungrouped view the same treatment without
  // changing how it looks.
  var CullingGroup=L.LayerGroup.extend({
    initialize:function(){ L.LayerGroup.prototype.initialize.call(this); this._all=[]; },
    addLayer:function(m){ this._all.push(m); return this; },
    clearLayers:function(){ this._all=[]; return L.LayerGroup.prototype.clearLayers.call(this); },
    // Call once after a draw loop has finished adding; moveend handles the rest.
    commit:function(){ this._cull(); return this; },
    onAdd:function(mp){ L.LayerGroup.prototype.onAdd.call(this,mp); mp.on('moveend',this._cull,this); this._cull(); },
    onRemove:function(mp){ mp.off('moveend',this._cull,this); L.LayerGroup.prototype.onRemove.call(this,mp); },
    _cull:function(){
      if(!this._map) return;
      var z=this._map.getZoom();
      // Culling by viewport does nothing at country zoom, where every pin IS in the
      // viewport - which is exactly where the map felt heaviest. Below z11 the draw is
      // capped as well. _all arrives priority-sorted (closed won, in process, closed
      // lost, then CRM), so a cap drops the least important pins first, and the count
      // it drops is printed on screen rather than left for someone to notice.
      var budget = z<9 ? 4000 : (z<11 ? 9000 : (z<13 ? 20000 : Infinity));
      var b=this._map.getBounds().pad(0.2), all=this._all, drawn=0, inView=0;
      L.LayerGroup.prototype.clearLayers.call(this);
      for(var i=0;i<all.length;i++){
        if(!b.contains(all[i].getLatLng())) continue;
        inView++;
        if(drawn>=budget) continue;
        L.LayerGroup.prototype.addLayer.call(this,all[i]); drawn++;
      }
      this._drawn=drawn; this._inView=inView;
      if(typeof onCull==='function') onCull();
    },
    // The search panel jumps to a pin that may be culled out of view. Fly first,
    // re-cull, then open - otherwise openPopup fires on a marker that is not on
    // the map and nothing happens.
    reveal:function(m,cb){
      var self=this;
      this._map.once('moveend',function(){ self._cull(); cb(); });
      this._map.setView(m.getLatLng(), Math.max(this._map.getZoom(),15));
    }
  });
  // Tell the viewer whenever the low-zoom cap is actually biting. Silence would make a
  // thinned map look like the whole picture, which is the one thing this map must not do.
  function onCull(){
    var el=document.getElementById('drawnote');
    if(!el) return;
    var hidden=0;
    [crmPlain,uniPlain].forEach(function(g){
      if(g && g._map && typeof g._inView==='number') hidden += (g._inView - g._drawn);
    });
    if(hidden>0){
      el.textContent='Drawing the '+( (crmPlain._drawn||0) + (uniPlain._drawn||0) ).toLocaleString()+
        ' most important pins here; '+hidden.toLocaleString()+' more are in view. Zoom in, or tick '+
        '"Group nearby pins", to see every one.';
      el.style.display='';
    } else el.style.display='none';
  }
  var crmPlain=new CullingGroup();
  var crmCluster=L.markerClusterGroup({chunkedLoading:true,maxClusterRadius:42,showCoverageOnHover:false,
    disableClusteringAtZoom:16,iconCreateFunction:clusterIcon('rgba(26,115,232,.86)')});
  var uniPlain=new CullingGroup();
  var uniCluster=L.markerClusterGroup({chunkedLoading:true,maxClusterRadius:60,showCoverageOnHover:false,
    disableClusteringAtZoom:17,iconCreateFunction:clusterIcon('rgba(0,150,148,.80)')});
  var clusterOn=false;
  function crmGroupNow(){ return clusterOn?crmCluster:crmPlain; }
  function uniGroupNow(){ return clusterOn?uniCluster:uniPlain; }

  var STAGE={closed_won:'Closed won',in_process:'In process',closed_lost:'Closed lost',crm:'On the CRM'};
  var markerIndex=[];

  function radiusFor(c,base){
    if(!sizeByValue||!c.m) return base;
    return Math.max(base, Math.min(20, 4 + Math.sqrt(c.m)/220));
  }

  function popupFor(c,color){
    var kv='';
    if(c.ga) kv+='<dt>Address</dt><dd>'+esc(c.ga)+'</dd>';
    if(c.m) kv+='<dt>Deal value</dt><dd>'+esc(aed(c.m))+'</dd>';
    if(c.s) kv+='<dt>Stage</dt><dd>'+esc(c.s)+'</dd>';
    if(c.o) kv+='<dt>Owner</dt><dd>'+esc(c.o)+'</dd>';
    if(c.cd) kv+='<dt>'+(c.ao?'Last disbursed':'Close date')+'</dt><dd>'+esc(c.cd)+'</dd>';
    if(c.fi){var f=c.fi;kv+='<dt>Financed</dt><dd>'+(f[0]>1?f[0]+' times (repeat client)':'Once')+'</dd><dt>First disbursed</dt><dd>'+esc(f[1])+(f[5]?' <span style=\"color:#70707B\">(approx.)</span>':'')+'</dd>'+(f[0]>1?'<dt>Latest disbursed</dt><dd>'+esc(f[2])+'</dd>':'')+'<dt>Status</dt><dd>'+(f[3]?'Ongoing &mdash; last instalment due '+esc(f[4]):'Ended '+esc(f[4]||f[2]))+'</dd>';}
    if(c.r) kv+='<dt>Reason</dt><dd>'+esc(c.r)+'</dd>';
    if(c.d) kv+='<dt>Deals</dt><dd>'+c.d+'</dd>';
    if(c.ai) kv+='<dt>Admin industry</dt><dd>'+esc(String(c.ai).replace(/_/g,' ').toLowerCase())+'</dd>';
    if(c.co) kv+='<dt>Closed by</dt><dd>'+esc(c.co)+' <span style="color:#70707B">(admin app)</span></dd>';
    var dis = c.hs ? '<div class="pnote" style="border-top-color:#FDB022;color:#FDB022">HubSpot still has this as <b>'+esc(STAGE[c.hs])+'</b>. The admin app is authoritative for won and lost, so the map follows it.</div>' : '';
    var loc = (c.h==='exact'||c.h==='geocoded')
      ? '<b>Exact.</b> Street address geocoded against OpenStreetMap.'
      : c.h==='named'
      ? 'Located by matching the business name to an OpenStreetMap record.'
      : c.h==='area'
      ? (c.a
          ? '<b>Approximate &mdash; area only.</b> No exact street address on record. This pin is placed at a random point inside <b>'+esc(c.a)+'</b>, which is where we know the business is. It is <i>not</i> the building.'
          : '<b>Approximate &mdash; street only.</b> The address on record is a road name, not a building. This pin is spread around a point on that road in <b>'+esc(c.e||'')+'</b>. It is <i>not</i> the building.')
      : c.h==='uae'
      ? '<b>UAE, emirate unknown.</b> This company&rsquo;s own record says its country is the United Arab Emirates, but nothing names an emirate — not its record, not its contacts, not its website. The pin sits at a random populated point in the country. It confirms the UAE and tells you <i>nothing</i> below that.'
      : c.h==='emirate'
      ? '<b>Approximate &mdash; emirate only.</b> No street address and no area on record. This pin is placed at a random point inside <b>'+esc(c.e||'')+'</b>. All it tells you is the emirate.'
      : 'No usable location on record.';
    if(c.rt) loc += '<br><span class="muted">Placed via: '+esc(c.rt)+'</span>';
    if(c.cf) loc += '<div class="pnote" style="border-top-color:#FDB022;color:#FDB022"><b>Record disagrees with itself.</b> The CRM city says <b>'+esc(c.e||'the UAE')+'</b> but the ZIP code or state on the same record points abroad, so the street address was not used. Fix the record in HubSpot and the pin sharpens on the next refresh.</div>';
    var gm=gmapsUrl(c.n,c.a,c.e);
    return '<div class="pn">'+esc(c.n)+'</div>'+
      '<div class="pi">'+esc(DATA.categories[c.c]||c.c)+(c.a?' &middot; '+esc(c.a):'')+'</div>'+
      '<span class="pb" style="background:'+color+'">'+esc(STAGE[c.l])+(c.t==='risk_rejected'?' &middot; Risk':'')+'</span>'+
      (c.src==='admin'?' <span class="pb" style="background:#5f6368">per the admin app</span>':'')+
      (kv?'<dl class="kv">'+kv+'</dl>':'')+dis+
      '<div class="pnote">'+loc+(c.lc?' Marked a customer by lifecycle stage, with no won deal attached.':'')+
      '<div class="pid">'+
        [ c.ao ? null : '<a href="'+HUBSPOT_URL.replace('{id}',encodeURIComponent(c.i))+'" target="_blank" rel="noopener">Open in HubSpot &rarr;</a>',
          (c.aid && ADMIN_CLIENT_URL) ? '<a href="'+ADMIN_CLIENT_URL.replace('{id}',encodeURIComponent(c.aid))+'" target="_blank" rel="noopener">Open in the admin app &rarr;</a>' : null,
          gm ? '<a href="'+gm+'" target="_blank" rel="noopener">Find on Google Maps &rarr;</a>' : null
        ].filter(Boolean).join(' &middot; ')+
        (c.ao ? ' <span>no HubSpot record</span>' : '')+
      '</div></div>';
  }

  function drawCRM(){
    var ownAll=!ownOn||allOn(ownOn);
    crmPlain.clearLayers(); crmCluster.clearLayers(); markerIndex=[];
    var target=crmGroupNow(), other=clusterOn?crmPlain:crmCluster;
    if(map.hasLayer(other)) map.removeLayer(other);
    var shown=0;
    // Draw order matters now there are 27,821 grey CRM pins against ~1,400
    // coloured ones. In record order the grey layer lands on top and buries
    // every won, in-process and lost deal - the pins anyone actually opens this
    // map for. So the quiet layer is drawn first and the loud ones last.
    if(!DATA._order){
      var rank={crm:0,closed_lost:1,in_process:2,closed_won:3};
      DATA._order=DATA.companies.slice().sort(function(a,b){
        return (rank[a.l]||0)-(rank[b.l]||0);
      });
    }
    DATA._order.forEach(function(c){
      if(!on[c.l]||!catOn[c.c]) return;
      if(!emOn[c.e||'Unknown']) return;
      if(!precOn[c.h==='geocoded'?'exact':(c.h||'emirate')]) return;
      if(hsOwnOn && !hsOwnOn[c.o||'__none']) return;
      if(ownOn && !ownAll){
        // any commercial owner deselected: only funded pins whose closer is ticked
        if(!c.af) return;
        var cos=c.co?c.co.split(', '):['__none'], hit=false;
        for(var q=0;q<cos.length;q++){ if(ownOn[cos[q]]){ hit=true; break; } }
        if(!hit) return;
      }
      var L0=BY_KEY[c.l]; if(!L0) return;
      shown++;
      var color = (c.l==='closed_lost'&&c.t==='risk_rejected') ? '#8e24aa' : L0.color;   // purple: Risk rejection, distinct from in-process amber
      var quiet = (c.l==='crm');
      // A pin's STRENGTH encodes how well we know where it is. A solid dot with
      // a white ring is a real geocoded address. Anything scattered inside an
      // area or an emirate is drawn weaker and ringless, so a full-looking map
      // can never be mistaken for a precise one.
      var area = (c.h==='area'), vague = (c.h==='emirate'||c.h==='uae'), untraced = (c.h==='uae');
      // Approximate pins must be TELLABLE APART from exact ones without
      // becoming invisible. A first attempt dropped them to 20% opacity with no
      // stroke and they vanished entirely at country zoom, which is worse than
      // not distinguishing them at all - the map just looked empty.
      // An exact pin keeps the white ring; approximate pins lose the ring and
      // are softened, but stay clearly readable.
      var fo = quiet?.8:.95;
      if(area) fo*=.95; if(vague) fo*=.85; if(untraced) fo*=.75;
      var m=L.circleMarker([c.y,c.x],{
        radius: radiusFor(c,quiet?4:L0.r) * (untraced?.7:(vague?.85:(area?.92:1))),
        color: (area||vague)?color:'#fff',
        weight: vague?0.5:(area?1:(quiet?1:2)),
        opacity: (area||vague)?.85:1,
        fillColor:color, fillOpacity:fo});
      m.bindPopup(popupFor(c,color));
      if(showLabels) m.bindTooltip(c.n,{permanent:true,direction:'right',offset:[6,0],className:'lbl'});
      else m.bindTooltip(c.n,{direction:'top',className:'lbl'});
      target.addLayer(m);
      markerIndex.push({c:c,m:m});
    });
    if(!map.hasLayer(target)) map.addLayer(target);
    if(target.commit) target.commit();   // ungrouped: render only what is in view
    return shown;
  }

  function drawUniverse(){
    uniPlain.clearLayers(); uniCluster.clearLayers();
    if(!on.universe){ if(map.hasLayer(uniPlain)) map.removeLayer(uniPlain); if(map.hasLayer(uniCluster)) map.removeLayer(uniCluster); return; }
    var utarget=uniGroupNow(), uother=clusterOn?uniPlain:uniCluster;
    if(map.hasLayer(uother)) map.removeLayer(uother);
    DATA.universe.forEach(function(p){
      if(!catOn[p.c]) return;
      if(p.e && !emOn[p.e]) return;
      var m=L.circleMarker([p.y,p.x],{radius:3.5,color:'#fff',weight:1,opacity:.9,
        fillColor:CAT_COLOR[p.c]||'#009694',fillOpacity:.85});
      m.bindPopup('<div class="pn">'+esc(p.n)+'</div><div class="pi">'+esc(DATA.categories[p.c]||p.c)+
        ' &middot; '+esc(String(p.k).replace(/_/g,' '))+'</div>'+
        '<div class="pnote">Market universe, from OpenStreetMap'+(p.e?' &middot; '+esc(p.e):'')+'. Not a CRM record.'+
        (gmapsUrl(p.n,null,p.e)?'<div class="pid"><a href="'+gmapsUrl(p.n,null,p.e)+'" target="_blank" rel="noopener">Find on Google Maps &rarr;</a></div>':'')+'</div>');
      if(showLabels) m.bindTooltip(p.n,{permanent:true,direction:'right',offset:[5,0],className:'lbl'});
      else m.bindTooltip(p.n,{direction:'top',className:'lbl'});
      utarget.addLayer(m);
    });
    if(!map.hasLayer(utarget)) map.addLayer(utarget);
    if(utarget.commit) utarget.commit();
  }

  function renderLegend(){
    var rows=LAYERS.map(function(l){
      return '<label class="lg'+(on[l.key]?'':' off')+'" data-k="'+l.key+'">'+
        '<span class="dot" style="background:'+l.color+'"></span>'+l.label+
        ' <span class="n">'+fmt(DATA.stats.crm.byLayer[l.key]||0)+'</span></label>';});
    rows.push('<label class="lg'+(on.universe?'':' off')+'" data-k="universe">'+
      '<span class="dot" style="background:#009694"></span>Market universe <span class="n">'+
      fmt(DATA.universe.length)+'</span></label>');
    document.getElementById('legend').innerHTML=rows.join('');
    Array.prototype.forEach.call(document.querySelectorAll('.lg'),function(el){
      el.onclick=function(){ on[el.getAttribute('data-k')]=!on[el.getAttribute('data-k')]; renderLegend(); redraw(); };});
  }

  // One dropdown per filter (23 Sep 2026, replacing rows of toggle chips): "All"
  // or exactly one value. Simpler to read, and it leaves room on a small screen.
  // A multi-select checklist (24 Sep 2026, replacing single-choice dropdowns):
  // summary button, expands in place; All / None; a find box for long lists.
  // isOn(k) reads a key; setOne(k,bool) writes one; setAll(bool) writes every key.
  var mselOpen=null;
  function closeMsel(focusBtn){
    if(!mselOpen) return;
    var b=mselOpen.querySelector('.msel-btn');
    mselOpen.classList.remove('open'); b.setAttribute('aria-expanded','false');
    if(focusBtn) b.focus();
    mselOpen=null;
  }
  document.addEventListener('click',function(e){ if(mselOpen && !mselOpen.contains(e.target)) closeMsel(false); });
  document.addEventListener('keydown',function(e){ if(e.key==='Escape' && mselOpen) closeMsel(true); });
  // Rebuilding 33k markers costs ~0.3 s; rapid ticks coalesce into one rebuild.
  var redrawT=null;
  function scheduleRedraw(){ clearTimeout(redrawT); redrawT=setTimeout(function(){ redrawT=null; redraw(); },180); }
  function fillSelect(id, allLabel, items, isOn, setOne, setAll, tail){
    var el=document.getElementById(id);
    var wasOpen=el.classList.contains('open');
    var h=el.previousElementSibling; if(h && h.tagName==='H4' && !h.id) h.id=id+'-h';
    function summary(){
      var onItems=items.filter(function(it){return isOn(it.k);});
      if(onItems.length===items.length) return allLabel;
      var t=tail?tail():'';
      if(!onItems.length) return 'None selected'+t;
      if(onItems.length<=2) return onItems.map(function(it){return it.label;}).join(', ')+t;
      return onItems.length+' of '+items.length+' selected'+t;
    }
    el.innerHTML='<button type="button" class="msel-btn" aria-haspopup="true" aria-controls="'+id+'-pop"'+(h&&h.id?' aria-labelledby="'+h.id+' '+id+'-sum"':'')+' aria-expanded="'+(wasOpen?'true':'false')+'">'+
        '<span class="sum" id="'+id+'-sum">'+esc(summary())+'</span><span class="chev" aria-hidden="true">&#9660;</span></button>'+
      '<div class="msel-pop" id="'+id+'-pop"><div class="msel-tools"><button type="button" data-a="all">All</button><button type="button" data-a="none">None</button>'+
        (items.length>10?'<input class="msel-find" type="search" placeholder="Find\u2026" aria-label="Find">':'')+'</div>'+
      '<div class="msel-list" role="group"'+(h&&h.id?' aria-labelledby="'+h.id+'"':'')+'>'+items.map(function(it,i){
        return '<label class="msel-row"><input type="checkbox" data-i="'+i+'"'+(isOn(it.k)?' checked':'')+'>'+
          '<span class="t">'+esc(it.label)+'</span><span class="n">'+fmt(it.n)+'</span></label>';
      }).join('')+'</div></div>';
    var btn=el.querySelector('.msel-btn'), sum=btn.querySelector('.sum'), boxes=el.querySelectorAll('input[type=checkbox]');
    function refresh(){
      sum.textContent=summary();
      for(var i=0;i<boxes.length;i++) boxes[i].checked=isOn(items[i].k);
      scheduleRedraw();
    }
    btn.onclick=function(e){
      e.stopPropagation();
      if(mselOpen===el){ closeMsel(false); return; }
      closeMsel(false);
      el.classList.add('open'); mselOpen=el; btn.setAttribute('aria-expanded','true');
      // the list expands in place inside a scrolling panel: bring it into view, keeping the button visible
      var pop=el.querySelector('.msel-pop'), panel=document.getElementById('panel');
      if(panel){ var pr=panel.getBoundingClientRect(), over=pop.getBoundingClientRect().bottom-pr.bottom;
        if(over>0) panel.scrollTop+=Math.min(over+8, Math.max(0, el.getBoundingClientRect().top-pr.top-8)); }
      var fnd=el.querySelector('.msel-find'); if(fnd) fnd.focus({preventScroll:true});
    };
    el.querySelector('.msel-pop').onclick=function(e){ e.stopPropagation(); };
    for(var i=0;i<boxes.length;i++){
      boxes[i].onchange=(function(i){ return function(){ setOne(items[i].k, boxes[i].checked); refresh(); }; })(i);
    }
    var find=el.querySelector('.msel-find'), rows=el.querySelectorAll('.msel-row');
    el.querySelectorAll('.msel-tools button').forEach(function(b){
      b.onclick=function(e){
        e.stopPropagation();
        var v=b.getAttribute('data-a')==='all';
        if(find && find.value){ for(var i=0;i<rows.length;i++) if(!rows[i].classList.contains('hide')) setOne(items[i].k,v); }
        else setAll(v);
        refresh();
      };
    });
    if(find){
      find.oninput=function(){
        var q=find.value.toLowerCase();
        for(var i=0;i<rows.length;i++) rows[i].classList.toggle('hide', !!q && items[i].label.toLowerCase().indexOf(q)<0);
      };
      // Escape clears a query first; only an empty box lets Escape close the list
      find.onkeydown=function(e){ if(e.key==='Escape' && find.value){ e.stopPropagation(); find.value=''; find.oninput(); } };
    }
  }
  function renderCats(){
    var keys=DATA.target.concat(['other','blank']), bc=DATA.stats.crm.byCategory||{};
    fillSelect('cats','All categories',
      keys.map(function(k){return {k:k,label:DATA.categories[k]||k,n:bc[k]||0};}),
      function(k){return !!catOn[k];},
      function(k,v){ catOn[k]=v; },
      function(v){ keys.forEach(function(k){ catOn[k]=v; }); });
  }
  function renderEms(){
    var be=DATA.stats.byEmirate||{};
    fillSelect('ems','All emirates',
      EMIRATES.map(function(k){return {k:k,label:k,n:be[k]?be[k].total:0};}),
      function(k){return !!emOn[k];},
      function(k,v){
        emOn[k]=v;
        // pins with no emirate are filed under Unknown; they belong to the "UAE, emirate unknown" row
        if(k==='UAE, emirate unknown') emOn.Unknown=v;
      },
      function(v){ EMIRATES.forEach(function(k){ emOn[k]=v; }); emOn.Unknown=v; });
  }
  function renderHsOwn(){
    var counts={}, none=0;
    DATA.companies.forEach(function(c){ if(c.o) counts[c.o]=(counts[c.o]||0)+1; else none++; });
    var names=Object.keys(counts).sort(function(a,b){return counts[b]-counts[a];});
    var items=names.map(function(n){return {k:n,label:n,n:counts[n]};});
    if(none) items.push({k:'__none',label:'No owner',n:none});
    if(!hsOwnOn){ hsOwnOn={}; items.forEach(function(it){ hsOwnOn[it.k]=true; }); }
    fillSelect('hsown','All owners',items,
      function(k){return !!hsOwnOn[k];},
      function(k,v){ hsOwnOn[k]=v; },
      function(v){ items.forEach(function(it){ hsOwnOn[it.k]=v; }); });
  }
  function renderOwn(){
    var counts={}, none=0;
    DATA.companies.forEach(function(c){ if(!c.af) return; if(!c.co){ none++; return; } c.co.split(', ').forEach(function(o){ counts[o]=(counts[o]||0)+1; }); });
    var names=Object.keys(counts).sort(function(a,b){return counts[b]-counts[a];});
    if(!names.length) return;
    document.getElementById('ownh').style.display=''; document.getElementById('own').style.display=''; document.getElementById('ownnote').style.display='';
    var items=names.map(function(n){return {k:n,label:n,n:counts[n]};});
    if(none) items.push({k:'__none',label:'Funded, nobody assigned',n:none});
    if(!ownOn){ ownOn={}; items.forEach(function(it){ ownOn[it.k]=true; }); }
    fillSelect('own','All funded clients, any owner',items,
      function(k){return !!ownOn[k];},
      function(k,v){ ownOn[k]=v; },
      function(v){ items.forEach(function(it){ ownOn[it.k]=v; }); },
      function(){ return ' \u00b7 funded only'; });   // any closer unticked = only funded pins are drawn
  }
  function renderPrec(){
    var bp=DATA.stats.byPlacement||{};
    fillSelect('prec','All pins',
      PREC.map(function(p){return {k:p[0],label:p[1],n:bp[p[0]]||0};}),
      function(k){return !!precOn[k];},
      function(k,v){ precOn[k]=v; },
      function(v){ PREC.forEach(function(p){ precOn[p[0]]=v; }); });
  }

  var INFO={
    placement:{h:'How pins are placed',b:function(){var b=DATA.stats.byPlacement||{};var s=DATA.stats;return ''+
      '<dl><dt>The number</dt><dd><b>'+fmt(s.drawn)+'</b> of '+fmt(s.total)+' companies are drawn. '+fmt(b.notdrawn||0)+' are counted but not drawn.</dd>'+
      '<dt>How a pin is placed</dt><dd><code>1 street address  -> exact point   '+fmt(b.exact||0)+'\\n2 known area      -> inside area   '+fmt(b.area||0)+'\\n3 emirate only    -> inside emirate '+fmt(b.emirate||0)+'\\n4 nothing usable  -> not drawn    '+fmt(b.notdrawn||0)+'</code></dd>'+
      '<dt>Why this way</dt><dd>A company we know is in Al Quoz but have no address for is drawn <i>inside Al Quoz</i>, at a point chosen from its own record id so it never moves between rebuilds. The place is real and measured; only the exact spot within it is not. Nothing is ever drawn in a place we did not verify.</dd>'+
      '<dt>What would make it wrong</dt><dd>Reading a faded pin as a real address. Only '+fmt(b.exact||0)+' pins are true geocoded addresses &mdash; switch off the other precision filters to see just those. An emirate-only pin tells you the emirate and nothing more.</dd></dl>';}},

    book:{h:'Outstanding book, by emirate',b:function(){var b=DATA.stats.book;if(!b)return '';return ''+
      '<dl><dt>What it counts</dt><dd>The amount funded clients currently owe FlapKap &mdash; the open principal, not what was disbursed and not fees &mdash; added up by the emirate each client sits in.</dd>'+
      '<dt>Formula</dt><dd><code>for each funded client (an approved disbursement in the admin app):<br>&nbsp;&nbsp;outstanding = latest open amount from the admin app<br>book[emirate] = sum of outstanding for clients whose pin is in that emirate</code></dd>'+
      '<dt>Why this way</dt><dd>You asked for the book at emirate level, for the whole UAE. Balances are the most sensitive figure in the system, so they are added up <i>before</i> anything reaches this page: no single merchant\u2019s balance exists in it. Emirates with fewer than '+b.minClients+' funded clients are merged into one row, because a total over two or three clients can be read back to one of them.</dd>'+
      '<dt>Coverage</dt><dd>'+fmt(b.clientsWithBalance)+' funded clients have a balance and a pin; '+fmt(b.clientsNoBalance)+' returned no balance; '+fmt(b.clientsNotOnMap)+' are outside the UAE and excluded. Balances as of '+esc(b.asOf||'the pull date')+'.</dd>'+
      '<dt>What would make it wrong</dt><dd>Balances move daily; this is a snapshot. The row &ldquo;UAE, emirate unknown&rdquo; is real money that no source could place in an emirate &mdash; do not spread it across the others. Egyptian merchants are not in any row.</dd></dl>';}},
    scope:{h:'What this map is NOT showing',b:function(){var s=DATA.stats.crmScope;if(!s)return '';return ''+
      '<dl><dt>The whole CRM, split three ways</dt><dd><code>says United Arab Emirates  '+fmt(s.uaeCountry)+'\\nsays somewhere else       '+fmt(s.elsewhere)+'\\nsays nothing at all       '+fmt(s.noCountry)+'\\n                        --------\\ntotal in HubSpot          '+fmt(s.total)+'</code></dd>'+
      '<dt>This map shows the first group</dt><dd><b>'+fmt(s.onMap)+'</b> companies. The '+fmt(s.elsewhere)+' that name another country are out of scope &mdash; this is a UAE map, and a company in Philadelphia or Cairo is not the market.</dd>'+
      '<dt>The ones nobody can place</dt><dd><b>'+fmt(s.noLocationAtAll)+'</b> companies said <i>nothing</i> about where they are &mdash; no city, no country, no region, no address, no postcode. Since then <b>'+fmt(s.noLocationDrawn||0)+'</b> of them have been placed from the address on their own website, their phone area code, a .ae domain or a contact, and are on the map. <b>'+fmt((s.noLocationStillUnknown!=null?s.noLocationStillUnknown:s.noLocationAtAll))+'</b> still cannot be placed anywhere; they are not on this map and are not counted as UAE, because a company nobody can place could be anywhere.</dd>'+
      '<dt>Why this matters</dt><dd>'+fmt((s.noLocationStillUnknown!=null?s.noLocationStillUnknown:s.noLocationAtAll))+' companies &mdash; '+Math.round(100*(s.noLocationStillUnknown!=null?s.noLocationStillUnknown:s.noLocationAtAll)/(s.total||47516))+'% of the CRM &mdash; are still in the dark. If even half of them are Emirati, this map is missing thousands of real UAE companies, not because they could not be placed but because nobody filled in where they are. That is a CRM data-quality item, not a map item.</dd></dl>';}},

    closed_won:{h:'Closed won',b:function(){var s=DATA.stats.crm;return ''+
      '<dl><dt>What it counts</dt><dd>Businesses that have actually been funded.</dd>'+
      '<dt>Formula</dt><dd><code>admin app: at least one approved disbursement\\n  OR HubSpot stage = Money Disbursed\\n  OR HubSpot lifecyclestage = customer</code></dd>'+
      '<dt>Why this way</dt><dd>You said the admin app is more reliable than HubSpot for won and lost, so it overrides the deal stage. '+fmt(s.adminOverrode||0)+' companies were reclassified by it.</dd>'+
      '<dt>Funded clients on the map</dt><dd>The admin app holds <b>'+fmt((DATA.stats.fundedScope||{}).total||372)+'</b> funded clients; <b>'+fmt((DATA.stats.fundedScope||{}).foreign||0)+'</b> are Egyptian merchants and outside a UAE map, leaving <b>'+fmt((DATA.stats.fundedScope||{}).uae||372)+'</b>. <b>'+fmt(DATA.stats.fundedOnMap||0)+'</b> pins carry the funded flag: '+fmt(DATA.stats.adminOnlyFunded||0)+' exist only in the admin app &mdash; HubSpot has no record of them &mdash; and are placed by their registered address or the emirate their trade licence was issued in (DET-Dubai, EDD-Sharjah, ADDED&hellip;); the rest reached the map through a CRM company matched by name. Admin-only pins carry no deal value, so the AED figure covers only the '+fmt(((DATA.stats.money||{}).wonN||0)-((DATA.stats.money||{}).wonNoValue||0))+' funded clients that have a HubSpot deal.</dd>'+
      '<dt>What would make it wrong</dt><dd>Funded means at least one approved invoice with a disbursed amount in the admin app, counted from the invoice list on 9 Oct 2026. Financing dates use the disbursement date, or the invoice creation date where that is missing (marked approx.). The financing count is one per client per calendar day.</dd></dl>';}},

    in_process:{h:'In process',b:function(){return ''+
      '<dl><dt>What it counts</dt><dd>Businesses with a live deal, not yet funded and not yet lost.</dd>'+
      '<dt>Formula</dt><dd><code>deal (pipeline, stage id) maps to "open"\\n  in lookups/stage-map.json\\n  AND the company has no won or lost deal</code></dd>'+
      '<dt>Why this way</dt><dd>Stage names in this portal do not match their ids. The id <b>closedwon</b> is labelled "Offer Sent" and <b>closedlost</b> is labelled "Signed". Every pipeline and stage id pair is mapped by hand rather than trusted.</dd>'+
      '<dt>What would make it wrong</dt><dd>Four stage labels exist under three or four different ids each. Grouping by label instead of id would silently merge them.</dd></dl>';}},

    closed_lost:{h:'Closed lost',b:function(){var s=DATA.stats.crm;return ''+
      '<dl><dt>What it counts</dt><dd>Businesses lost by sales, rejected by Risk, or closed in the admin app.</dd>'+
      '<dt>Formula</dt><dd><code>admin.status IN (LOST_IN_ACQUISITION,\\n    POST_ANALYSIS_REJECTION, AUTO_REJECTION, CLOSED)\\n  OR deal stage maps to "lost_sales" or "lost_risk"</code></dd>'+
      '<dt>Why this way</dt><dd>Same rule as won: the admin app wins. '+fmt(s.adminLost||0)+' of these come from the admin app rather than from HubSpot.</dd>'+
      '<dt>What would make it wrong</dt><dd><b>Three different loss taxonomies sit in this one layer.</b> A merchant who went quiet, one rejected by Risk, and one lost before any analysis are not the same thing. Amber pins are Risk rejections; red are the rest.</dd></dl>';}},

    crm:{h:'On the CRM',b:function(){var s=DATA.stats.crm;return ''+
      '<dl><dt>What it counts</dt><dd>Every company record pulled for this map.</dd>'+
      '<dt>Formula</dt><dd><code>SELECT ... FROM COMPANY\\nWHERE city LIKE &#39;%dubai%&#39;\\n   OR associations.DEAL IS NOT NULL</code></dd>'+
      '<dt>Why this way</dt><dd>City is the only location field HubSpot fills reliably. The deal clause adds every company that has a deal anywhere, so no won or lost business is missed because its city is blank.</dd>'+
      '<dt>What would make it wrong</dt><dd>A company trading in Dubai but registered elsewhere, with no deal, is not here. '+fmt(s.byCategory.blank||0)+' of these have no industry at all.</dd></dl>';}},

    pins:{h:'How every pin is placed',b:function(){var s=DATA.stats, b=s.byPlacement||{}, sc=s.crmScope||{};return ''+
      '<dl><dt>The number</dt><dd><b>'+fmt(s.drawn||0)+'</b> companies are on the map. '+fmt(s.excludedNotUAE||0)+' name another country and are left off; '+fmt(sc.noLocationStillUnknown||0)+' say nothing about where they are and cannot be placed.</dd>'+
      '<dt>How a pin is placed</dt><dd><code>1 street address, geocoded &rarr; solid pin, white ring &nbsp;'+fmt(b.exact||0)+'<br>2 area known &rarr; scattered inside that area &nbsp;'+fmt(b.area||0)+'<br>3 emirate known &rarr; scattered inside that emirate &nbsp;'+fmt(b.emirate||0)+'<br>4 UAE only &rarr; a populated point in the country &nbsp;'+fmt(b.uae||0)+'</code></dd>'+
      '<dt>Where the evidence comes from</dt><dd>The company record itself first (city, region, address, then name), then the address it publishes on its own website, then its phone area code or .ae domain, then its contacts. A contact can name an emirate but never produces a street pin: only 53 contacts in the whole CRM carry an address. No phone number is stored anywhere; only the emirate its area code names.</dd>'+
      '<dt>What would make it wrong</dt><dd>Reading a scattered pin as the building. Only the '+fmt(b.exact||0)+' ringed pins are real addresses; every other pin is inside the right place but at a chosen point, seeded from the record id so it never moves between rebuilds. No place is invented.</dd></dl>';}}
  };

  function openInfo(k){
    var i=INFO[k]; if(!i) return;
    document.getElementById('dlgh').textContent=i.h;
    document.getElementById('dlgb').innerHTML=i.b();
    document.getElementById('dlg').showModal();
  }
  document.getElementById('dlgx').onclick=function(){ document.getElementById('dlg').close(); };

  function renderStats(){
    var s=DATA.stats.crm;
    var rows=[
      {k:'closed_won',n:fmt(s.byLayer.closed_won||0),l:'Closed won',c:'#0b8043',a:aed(s.wonAmount)},
      {k:'in_process',n:fmt(s.byLayer.in_process||0),l:'In process',c:'#f5a623',a:aed(s.pipelineAmount)},
      {k:'closed_lost',n:fmt(s.byLayer.closed_lost||0),l:'Closed lost',c:'#d93025',a:aed(s.lostAmount)},
      {k:'crm',n:fmt(s.total),l:'On the CRM',c:'#7d8894',a:null}
    ];
    // The number the user asked to have flagged: companies nothing places
    // anywhere. Not UAE, not foreign - unknown. Shown beside the map's own
    // totals so the 28,748 is never read as "all our companies".
    var sc=DATA.stats.crmScope;
    if(sc) rows.push({k:'scope',n:fmt(sc.noLocationStillUnknown!=null?sc.noLocationStillUnknown:sc.noLocationAtAll),l:'Location unknown',c:'#b06000',
      a:'not on this map &middot; might be UAE'});
    document.getElementById('stats').innerHTML=rows.map(function(r){
      return '<div class="stat"><div class="num" style="color:'+r.c+'">'+r.n+'</div>'+
        '<div class="lbl"><span>'+r.l+'</span><button class="i" data-i="'+r.k+'" title="How this is worked out">i</button></div>'+
        (r.a?'<div class="amt">'+r.a+'</div>':'')+'</div>';}).join('');
    Array.prototype.forEach.call(document.querySelectorAll('.stat .i'),function(el){
      el.onclick=function(){ openInfo(el.getAttribute('data-i')); };});
  }

  function redraw(){
    var shown=drawCRM(); drawUniverse(); renderStats();
    var s=DATA.stats, b=s.byPlacement||{}, sc=s.crmScope||{};
    document.getElementById('locnote').innerHTML=
      'Drawing <b>'+fmt(shown)+'</b> pins from the layers you have switched on. '+
      '<b>'+fmt(s.drawn||0)+'</b> companies are on the map &mdash; '+
      fmt(b.exact||0)+' at an exact street address, '+
      fmt(b.area||0)+' inside a known area, '+
      fmt(b.emirate||0)+' inside a known emirate, '+
      fmt(b.uae||0)+' somewhere in the UAE. '+
      fmt(s.excludedNotUAE||0)+' name another country and are left off; '+
      fmt(sc.noLocationStillUnknown||0)+' say nothing about where they are. '+
      '<button class="i" id="ipins" title="Why">i</button>';
    var ip=document.getElementById('ipins'); if(ip) ip.onclick=function(){ openInfo('pins'); };
  }

  // search
  document.getElementById('q').oninput=function(e){
    var q=e.target.value.trim().toLowerCase();
    var box=document.getElementById('hits');
    if(q.length<2){ box.innerHTML=''; return; }
    var hits=markerIndex.filter(function(x){return (x.c.n||'').toLowerCase().indexOf(q)>=0;}).slice(0,25);
    box.innerHTML=hits.map(function(x,i){
      return '<div class="hit" data-i="'+i+'">'+esc(x.c.n)+' <i>'+esc(STAGE[x.c.l])+'</i></div>';}).join('')
      || '<div class="hit"><i>No pinned business matches</i></div>';
    Array.prototype.forEach.call(box.querySelectorAll('.hit[data-i]'),function(el){
      el.onclick=function(){ goTo(hits[Number(el.getAttribute('data-i'))]); };});
  };
  // Fly to a markerIndex entry and open its popup. Used by the search box and by ?company=.
  function goTo(h){
    // Never past the layer maximum, and never an animated fly on a map whose
    // container has no size yet (a hidden tab) - both make Leaflet throw NaN.
    var z=Math.min(17,map.getMaxZoom()), sz=map.getSize();
    if(sz.x>0&&sz.y>0) map.flyTo([h.c.y,h.c.x],z,{duration:.7}); else map.setView([h.c.y,h.c.x],z,{animate:false});
    if(clusterOn) crmCluster.zoomToShowLayer(h.m,function(){ h.m.openPopup(); });
    // Ungrouped: the pin may be culled out of view, in which case openPopup
    // would fire on a marker that is not on the map and do nothing. reveal()
    // flies to it, re-culls so it exists, then opens.
    else crmPlain.reveal(h.m,function(){ h.m.openPopup(); });
  }

  // Deep link from HubSpot: ?company=<hubspot company id> opens that company's pin.
  function deepLink(){
    var deepId=(new URLSearchParams(location.search).get('company')||'').trim();
    if(!deepId) return;
    var c=null;
    for(var k=0;k<DATA.companies.length;k++){
      var x=DATA.companies[k];
      if(!x.ao && String(x.i)===deepId){ c=x; break; }
    }
    if(!c){
      var dn=document.getElementById('deepnote');
      dn.innerHTML='<span class="x" onclick="this.parentNode.style.display=\\'none\\'">&times;</span>'+
        '<b>HubSpot company '+esc(deepId)+' is not on this map.</b> Likely reasons: its record names a country '+
        'other than the UAE, it has no location on record, or it was not in the CRM snapshot of '+esc(DATA.pulled)+'.';
      dn.style.display='block';
      return;
    }
    // Switch on every filter that would hide this pin, then redraw so it exists.
    var ch=false;
    function need(o,key){ if(o && !o[key]){ o[key]=true; ch=true; } }
    need(on,c.l); need(catOn,c.c); need(emOn,c.e||'Unknown');
    need(precOn,c.h==='geocoded'?'exact':(c.h||'emirate'));
    need(hsOwnOn,c.o||'__none');
    if(ownOn && !allOn(ownOn)){
      (c.co?c.co.split(', '):['__none']).forEach(function(k){ need(ownOn,k); });
    }
    if(ch){ renderLegend(); renderCats(); renderEms(); renderPrec(); renderHsOwn(); renderOwn(); redraw(); }
    for(var j=0;j<markerIndex.length;j++){
      if(markerIndex[j].c===c){ goTo(markerIndex[j]); return; }
    }
  }

  // ---- Plan a visit day -------------------------------------------------------
  // Drag a box over the map, get the pins inside it as a stop list, put them in a
  // sensible driving order, then hand the route to Google Maps or download it as a CSV.
  // Free and browser-only: straight-line distances, no routing service. The stops are
  // kept as company objects, not markers, because redraw() rebuilds every marker -
  // a marker is looked up in markerIndex only when a row is clicked.
  var PLAN_MAX=30;     // stops listed from one box
  var LEG_MAX=11;      // a Google Maps link takes an origin, a destination and 9 waypoints
  var planRank={closed_won:0,in_process:1,crm:2,closed_lost:3};
  var planShort={closed_won:'Won',in_process:'In process',closed_lost:'Lost',crm:'CRM'};
  var planStops=[];    // [{c:company, on:boolean}] in display / route order
  var planFound=0;     // pins inside the box, before the cap
  var planRouted=false, planKmTotal=0;
  var planRect=null, planTmp=null, planLine=null, planStart=null, planStartMk=null;
  var planDrawing=false, planDrag=null;
  var planRenderer=L.svg({padding:.5});   // own layer, so redraw() and the pin canvas never repaint over the route
  var planLayer=L.layerGroup().addTo(map);

  function planEl(id){ return document.getElementById(id); }
  function planMsg(t,warn){ var el=planEl('pmsg'); el.textContent=t||''; el.className='muted'+(warn?' pwarn':''); }
  function planPrecise(c){ return c.h==='exact'||c.h==='geocoded'; }
  function planApprox(c){ return c.h==='area'||c.h==='emirate'||c.h==='uae'; }
  function planChecked(){ return planStops.filter(function(s){ return s.on; }); }
  function planKm(a,b){
    var r=Math.PI/180, dl=(b[0]-a[0])*r, dn=(b[1]-a[1])*r;
    var h=Math.sin(dl/2)*Math.sin(dl/2)+Math.cos(a[0]*r)*Math.cos(b[0]*r)*Math.sin(dn/2)*Math.sin(dn/2);
    return 12742*Math.asin(Math.sqrt(h));
  }

  function planRender(){
    var box=planEl('plist'), chk=planChecked(), n=0;
    box.innerHTML=planStops.map(function(s,i){
      var c=s.c, color=(c.l==='closed_lost'&&c.t==='risk_rejected')?'#8e24aa':BY_KEY[c.l].color;
      var no=(planRouted&&s.on)?(++n):'';
      return '<div class="pstop'+(s.on?'':' off')+'">'+
        '<input type="checkbox" data-i="'+i+'"'+(s.on?' checked':'')+'>'+
        '<span class="pno">'+no+'</span>'+
        '<div class="pbody"><span class="pname" data-i="'+i+'" title="'+esc(c.n)+'">'+esc(c.n)+'</span>'+
        '<div class="ptags"><span class="pb2" style="background:'+color+'">'+
          ((c.l==='closed_lost'&&c.t==='risk_rejected')?'Risk':planShort[c.l])+'</span>'+
          (c.fi?'<span class="pb2" style="background:#0b8043">Funded</span>':'')+
          (planApprox(c)?'<span class="pb2 amb">approximate</span>':'')+
          (c.o?'<span>'+esc(c.o)+'</span>':'')+
        '</div></div></div>';
    }).join('');
    var hasAny=planStops.length>0;
    planEl('pact').style.display=hasAny?'':'none';
    planEl('pcsvrow').style.display=chk.length?'':'none';
    planEl('ptotal').style.display=planRouted?'':'none';
    if(planRouted) planEl('ptotal').textContent='Straight-line total: '+planKmTotal.toFixed(1)+' km. Roads will be longer.';
    planLinks();
  }

  // The stops inside a box, from the pins currently shown (so layer and filter
  // choices count). Closed won first, then in process, CRM, closed lost.
  function planFromBounds(b){
    var s=b.getSouth(), n=b.getNorth(), w=b.getWest(), e=b.getEast(), hit=[];
    markerIndex.forEach(function(x){
      var c=x.c; if(c.y>=s&&c.y<=n&&c.x>=w&&c.x<=e) hit.push(c);
    });
    hit.sort(function(a,b2){ return (planRank[a.l]!=null?planRank[a.l]:9)-(planRank[b2.l]!=null?planRank[b2.l]:9); });
    planFound=hit.length;
    planStops=hit.slice(0,PLAN_MAX).map(function(c){ return {c:c,on:true}; });
    planUnroute();
    if(!planFound) planMsg('No pins in that box with the layers you have on. Switch on more layers in the legend, or draw a bigger area.');
    else if(planFound>PLAN_MAX) planMsg('Showing '+PLAN_MAX+' of '+fmt(planFound)+', draw a smaller area.');
    else planMsg(planFound+' pin'+(planFound===1?'':'s')+' in the box. Untick any you will skip, then order them.');
    planRender();
  }
  function planSetRect(b){
    if(planRect) map.removeLayer(planRect);
    planRect=L.rectangle(b,{color:'#2970FF',weight:2,dashArray:'6 4',fillColor:'#2970FF',fillOpacity:.1,interactive:false,renderer:planRenderer}).addTo(map);
    planFromBounds(b);
  }

  function planUnroute(){
    planLayer.clearLayers(); planLine=null; planRouted=false; planKmTotal=0;
  }
  // Nearest neighbour from the first node, then 2-opt on the open path until no
  // reversal shortens it. The first node (your location, or the first ticked stop) stays put.
  function planOrder(){
    var chk=planChecked();
    if(!chk.length){ planMsg('Tick at least one stop first.',true); return; }
    var nodes=chk.map(function(s){ return {p:[s.c.y,s.c.x],s:s}; });
    if(planStart) nodes.unshift({p:planStart,s:null});
    var path=[nodes[0]], left=nodes.slice(1), i, j, k;
    while(left.length){
      var last=path[path.length-1], bi=0, bd=Infinity;
      for(i=0;i<left.length;i++){ var d=planKm(last.p,left[i].p); if(d<bd){ bd=d; bi=i; } }
      path.push(left.splice(bi,1)[0]);
    }
    var m=path.length, better=true, guard=0;
    while(better && guard++<200){
      better=false;
      for(i=1;i<m-1;i++){
        for(j=i+1;j<m;j++){
          var after=(j<m-1);
          var gain=planKm(path[i-1].p,path[i].p)+(after?planKm(path[j].p,path[j+1].p):0)
                  -planKm(path[i-1].p,path[j].p)-(after?planKm(path[i].p,path[j+1].p):0);
          if(gain>1e-9){
            for(k=0;k<Math.floor((j-i+1)/2);k++){ var t=path[i+k]; path[i+k]=path[j-k]; path[j-k]=t; }
            better=true;
          }
        }
      }
    }
    planUnroute();
    var ordered=path.filter(function(x){ return x.s; }).map(function(x){ return x.s; });
    planStops=ordered.concat(planStops.filter(function(s){ return !s.on; }));
    planRouted=true;
    var pts=path.map(function(x){ return x.p; }), km=0;
    for(i=1;i<pts.length;i++) km+=planKm(pts[i-1],pts[i]);
    planKmTotal=km;
    if(pts.length>1) planLine=L.polyline(pts,{color:'#2970FF',weight:3,opacity:.85,renderer:planRenderer,interactive:false}).addTo(planLayer);
    ordered.forEach(function(s,idx){
      L.marker([s.c.y,s.c.x],{interactive:false,keyboard:false,
        icon:L.divIcon({className:'rtn',html:String(idx+1),iconSize:[18,18]})}).addTo(planLayer);
    });
    planMsg('');
    planRender();
  }

  // Google Maps links. A stop is written as lat,lng only when we hold a real street
  // address for it; every other pin is scattered inside its area, so those go in as
  // text (name, area, emirate) and Google Maps finds the business itself.
  function planPoint(c){
    if(planPrecise(c)) return c.y.toFixed(6)+','+c.x.toFixed(6);
    return [c.n,c.a,(c.e&&c.e!=='UAE')?c.e:null,'UAE'].filter(Boolean).join(', ');
  }
  function planLegUrl(items){
    var u='https://www.google.com/maps/dir/?api=1';
    if(items.length>1) u+='&origin='+encodeURIComponent(items[0]);
    u+='&destination='+encodeURIComponent(items[items.length-1]);
    if(items.length>2) u+='&waypoints='+items.slice(1,-1).map(function(x){ return encodeURIComponent(x); }).join('%7C');
    return u+'&travelmode=driving';
  }
  // [{label, url}] - one link up to 11 stops, then chained legs that share their join stop.
  function planLegs(){
    if(!planRouted) return [];
    var seq=[];
    if(planStart) seq.push({t:planStart[0].toFixed(6)+','+planStart[1].toFixed(6),n:0});
    planChecked().forEach(function(s,i){ seq.push({t:planPoint(s.c),n:i+1}); });
    if(!seq.length) return [];
    var legs=[];
    if(seq.length<=LEG_MAX) legs.push({label:'Open in Google Maps',items:seq});
    else for(var a=0;a<seq.length-1;a+=LEG_MAX-1){
      var it=seq.slice(a,a+LEG_MAX), lo=it[0].n, hi=it[it.length-1].n;
      legs.push({label:'Leg '+(legs.length+1)+' ('+(lo===0?'start, ':'')+'stops '+Math.max(1,lo)+'-'+hi+')',items:it});
    }
    return legs.map(function(g){ return {label:g.label,url:planLegUrl(g.items.map(function(x){ return x.t; }))}; });
  }
  function planLinks(){
    var legs=planLegs();
    planEl('plinks').innerHTML=legs.map(function(g){
      return '<a class="pbtn pri block" target="_blank" rel="noopener" href="'+esc(g.url)+'">'+esc(g.label)+' &rarr;</a>';
    }).join('');
  }

  // CSV of the ticked stops, in route order once ordered. Coordinates are written only
  // for real street addresses, like the Google links; the precision column says which is which.
  function planCell(v){
    v=String(v==null?'':v);
    if(/^[=+\\-@]/.test(v) && isNaN(Number(v))) v="'"+v;   // a name must not run as a spreadsheet formula
    return /[",\\r\\n]/.test(v) ? '"'+v.replace(/"/g,'""')+'"' : v;
  }
  function planCsv(){
    var chk=planChecked(); if(!chk.length) return '';
    var rows=[['order','name','stage','funded','precision','address','area','emirate','owner','hubspot_url','lat','lng']];
    chk.forEach(function(s,i){
      var c=s.c, pin=planPrecise(c);
      rows.push([i+1,c.n,STAGE[c.l]+((c.l==='closed_lost'&&c.t==='risk_rejected')?' (Risk)':''),c.fi?'yes':'no',c.h||'',
        c.ga||'',c.a||'',c.e||'',c.o||'',c.ao?'':HUBSPOT_URL.replace('{id}',encodeURIComponent(c.i)),
        pin?c.y.toFixed(6):'',pin?c.x.toFixed(6):'']);
    });
    return rows.map(function(r){ return r.map(planCell).join(','); }).join('\\r\\n');
  }
  function planDownload(){
    var csv=planCsv(); if(!csv) return;
    var d=new Date(), p2=function(n){ return (n<10?'0':'')+n; };
    var a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob(['\\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));
    a.download='visit-day-'+d.getFullYear()+'-'+p2(d.getMonth()+1)+'-'+p2(d.getDate())+'.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(a.href); },3000);
  }

  function planLocate(){
    var btn=planEl('ploc');
    if(planStart){
      planStart=null; if(planStartMk){ map.removeLayer(planStartMk); planStartMk=null; }
      btn.textContent='Start from my location'; btn.classList.remove('on');
      if(planRouted) planOrder();
      return;
    }
    if(!navigator.geolocation){ planMsg('This browser cannot share your location. The route starts at the first stop.',true); return; }
    planMsg('Finding your location...');
    navigator.geolocation.getCurrentPosition(function(pos){
      planStart=[pos.coords.latitude,pos.coords.longitude];
      planStartMk=L.circleMarker(planStart,{radius:7,color:'#fff',weight:2,fillColor:'#2970FF',fillOpacity:1,interactive:false,renderer:planRenderer}).addTo(map);
      btn.textContent='Don\\'t start from my location'; btn.classList.add('on');
      if(planRouted) planOrder(); else planMsg('Starting from your location. Order the stops to plan the route.');
    },function(err){
      planMsg('Could not get your location ('+((err&&err.message)||'not allowed')+'). The route starts at the first stop.',true);
    },{enableHighAccuracy:true,timeout:10000,maximumAge:60000});
  }

  function planClear(){
    planDrawOff();
    if(planRect){ map.removeLayer(planRect); planRect=null; }
    planStops=[]; planFound=0; planUnroute();
    planStart=null; if(planStartMk){ map.removeLayer(planStartMk); planStartMk=null; }
    planEl('ploc').textContent='Start from my location'; planEl('ploc').classList.remove('on');
    planMsg('Switch on the layers you want in the legend, then drag a box over the area.');
    planRender();
  }

  // The box is drawn by hand with pointer events, which cover mouse, pen and touch
  // alike. While it is on, map dragging is off so the drag draws instead of panning.
  function planDrawOn(){
    planDrawing=true; map.dragging.disable();
    var ct=map.getContainer(); L.DomUtil.addClass(ct,'plan-drawing'); ct.style.touchAction='none';
    planEl('pdraw').textContent='Cancel drawing'; planEl('pdraw').classList.add('on');
    planMsg('Press on the map and drag to draw the box.');
  }
  function planDrawOff(){
    if(planTmp){ map.removeLayer(planTmp); planTmp=null; }
    planDrag=null;
    if(!planDrawing) return;
    planDrawing=false; map.dragging.enable();
    var ct=map.getContainer(); L.DomUtil.removeClass(ct,'plan-drawing'); ct.style.touchAction='';
    planEl('pdraw').textContent='Draw an area'; planEl('pdraw').classList.remove('on');
  }
  (function(){
    var ct=map.getContainer();
    ct.addEventListener('pointerdown',function(e){
      if(!planDrawing||(e.pointerType==='mouse'&&e.button!==0)) return;
      if(e.target.closest && e.target.closest('.leaflet-control')) return;
      e.preventDefault();
      try{ ct.setPointerCapture(e.pointerId); }catch(x){}
      planDrag={id:e.pointerId,a:map.mouseEventToLatLng(e),pt:map.mouseEventToContainerPoint(e),b:null};
    });
    ct.addEventListener('pointermove',function(e){
      if(!planDrag||e.pointerId!==planDrag.id) return;
      planDrag.b=map.mouseEventToLatLng(e);
      var bb=L.latLngBounds(planDrag.a,planDrag.b);
      if(planTmp) planTmp.setBounds(bb);
      else planTmp=L.rectangle(bb,{color:'#2970FF',weight:2,dashArray:'6 4',fillOpacity:.06,interactive:false,renderer:planRenderer}).addTo(map);
    });
    function up(e,cancel){
      if(!planDrag||e.pointerId!==planDrag.id) return;
      var d=planDrag, moved=map.mouseEventToContainerPoint(e).distanceTo(d.pt);
      if(planTmp){ map.removeLayer(planTmp); planTmp=null; }
      planDrag=null;
      if(cancel||moved<8) return;    // a stray click: stay in draw mode
      var bb=L.latLngBounds(d.a,map.mouseEventToLatLng(e));
      planDrawOff();
      planSetRect(bb);
    }
    ct.addEventListener('pointerup',function(e){ up(e,false); });
    ct.addEventListener('pointercancel',function(e){ up(e,true); });
  })();

  planEl('pdraw').onclick=function(){ if(planDrawing){ planDrawOff(); planMsg(''); } else planDrawOn(); };
  planEl('pclear').onclick=planClear;
  planEl('porder').onclick=planOrder;
  planEl('ploc').onclick=planLocate;
  planEl('pcsv').onclick=planDownload;
  planEl('plist').onchange=function(e){
    var i=e.target.getAttribute('data-i'); if(i==null||!planStops[i]) return;
    planStops[i].on=e.target.checked;
    if(planRouted){ planUnroute(); planMsg('Stops changed. Order them again.'); }
    planRender();
  };
  planEl('plist').onclick=function(e){
    var i=e.target.getAttribute&&e.target.getAttribute('data-i');
    if(i==null||!e.target.classList.contains('pname')||!planStops[i]) return;
    var c=planStops[i].c;
    for(var j=0;j<markerIndex.length;j++){ if(markerIndex[j].c===c){ goTo(markerIndex[j]); return; } }
    map.setView([c.y,c.x],Math.min(17,map.getMaxZoom()));   // hidden by a filter since: show where it is
  };
  // In-browser checks only.
  window.__planner={draw:function(s,w,n,e){ planSetRect(L.latLngBounds([s,w],[n,e])); },order:planOrder,legs:planLegs,csv:planCsv,
    download:planDownload,setStart:function(lat,lng){ planStart=[lat,lng]; },state:function(){ return {stops:planStops,found:planFound,routed:planRouted,km:planKmTotal}; }};

  document.getElementById('heat').onchange=function(e){ sizeByValue=e.target.checked; redraw(); };
  document.getElementById('cluster').onchange=function(e){ clusterOn=e.target.checked; redraw(); };

  var s=DATA.stats.crm;
  document.getElementById('sub').textContent =
    'CRM snapshot '+DATA.pulled+' \\u00b7 '+fmt(s.total)+' companies \\u00b7 '+
    fmt(DATA.stats.deals.total)+' deals \\u00b7 '+fmt(DATA.universe.length)+' businesses from OpenStreetMap';

  document.getElementById('note').innerHTML =
    '<span class="x" onclick="this.parentNode.style.display=\\'none\\'">&times;</span>'+
    '<b>Every pin is a real record.</b> Green is a funded client, amber an open deal, red a loss, '+
    'purple a Risk rejection, blue a company on the CRM with no deal yet. The <b>On the CRM</b> layer is '+fmt(s.byLayer.crm||0)+' companies and '+
    'starts switched off because it covers the city - click it in the legend to bring it in. '+
    'Click any pin for its deal value, stage, '+
    'owner and close date. '+fmt((DATA.stats.byPlacement||{}).exact||0)+' pins sit at a real geocoded street address and keep the white ring; '+
    'every other pin is scattered inside the area or emirate the business is known to be in, and is drawn without it.';

  var disN=DATA.companies.filter(function(c){return c.hs;}).length;
  if(disN) document.getElementById('note').innerHTML += ' <b>'+disN+' pinned businesses are classified differently by the two systems</b> — the admin app wins on won and lost.';
  function renderBook(){
    var b=DATA.stats.book; if(!b||!b.rows||!b.rows.length) return;
    var h='<table style="width:100%;font-size:11.5px;border-collapse:collapse">';
    b.rows.forEach(function(r){ h+='<tr><td style="padding:2px 0;color:#444">'+esc(r.emirate)+'</td><td style="text-align:right;color:#9a9a9a">'+fmt(r.clients)+'</td><td style="text-align:right;font-variant-numeric:tabular-nums;color:#111">'+esc(aed(r.outstanding))+'</td></tr>'; });
    h+='<tr><td style="padding-top:4px;border-top:1px solid #eee;font-weight:600">Total</td><td style="text-align:right;border-top:1px solid #eee;color:#9a9a9a">'+fmt(b.clientsWithBalance)+'</td><td style="text-align:right;border-top:1px solid #eee;font-weight:600">'+esc(aed(b.total))+'</td></tr></table>';
    h+='<div class="muted" style="margin-top:4px">Funded clients and what they currently owe, by emirate. As of '+esc(b.asOf||'the pull date')+'. Rows with fewer than '+b.minClients+' clients are merged.</div>';
    document.getElementById('book').innerHTML=h;
    document.getElementById('book').style.display='';
    document.getElementById('bookh').style.display='';
    var ib=document.getElementById('ibook'); if(ib) ib.onclick=function(){ openInfo('book'); };
  }
  // The panel hides behind a < / > handle; the map takes the space and re-measures itself.
  document.getElementById('ptog').onclick=function(){
    var p=document.getElementById('panel'), t=this, closed=p.classList.toggle('hidden');
    t.classList.toggle('closed',closed); t.innerHTML=closed?'&lsaquo;':'&rsaquo;'; t.title=closed?'Show the panel':'Hide the panel';
    setTimeout(function(){ map.invalidateSize(); lockZoom(); },50);
  };
  renderLegend(); renderCats(); renderEms(); renderPrec(); renderHsOwn(); renderOwn(); renderBook(); redraw();

  // The container has no size until layout settles. Fitting before that lands on
  // the whole world, which is what happened the first time.
  function pct(arr,p){ var a=arr.slice().sort(function(x,y){return x-y;}); return a[Math.floor((a.length-1)*p)]; }
  function fit(){
    map.invalidateSize();
    var lats=DATA.companies.map(function(c){return c.y;});
    var lngs=DATA.companies.map(function(c){return c.x;});
    if(!lats.length) return;
    // Open on the whole country and lock the shallowest zoom there. fitBounds
    // reads the container size, so it only runs when the container has one;
    // a hidden tab gets the fixed country view instead and locks on resize.
    var sz=map.getSize();
    // No animation here: an animated fit fires its own moveend a moment later,
    // which reveal() in deepLink() would take for the arrival at the pin and
    // open the popup on a marker the country-zoom cull had dropped.
    if(sz.x>0&&sz.y>0){ map.fitBounds(UAE_BOUNDS,{animate:false}); lockZoom(); }
    else map.setView([25.05,55.35], 8, {animate:false});
    deepLink();
  }
  if(document.readyState==='complete') setTimeout(fit,60);
  else window.addEventListener('load',function(){ setTimeout(fit,60); });
}
// Unpack the data, then run the page.
(function(){
  function fail(e){
    document.body.innerHTML='<div style="padding:40px;font:15px -apple-system,Segoe UI,sans-serif;max-width:560px;line-height:1.5">'+
      '<b>This map needs a current browser</b> - Chrome, Edge, Safari 16.4 or newer, Firefox 113 or newer.<br><br>'+
      '<span style="color:#888">'+String(e&&e.message||e)+'</span></div>';
  }
  function start(t){ DATA=(typeof t==='string')?JSON.parse(t):t; __expand(); __main(); }
  try{
    if(DATA_URL){
      // Server build: the server gzips this on the way out, so the bytes on the wire
      // match the inlined build. A 401 here means the session expired - say so rather
      // than letting it surface as a JSON parse error.
      fetch(DATA_URL)
        .then(function(r){
          if(r.status===401) throw new Error('Your session expired. Reload the page and sign in again.');
          if(!r.ok) throw new Error(DATA_URL+' -> '+r.status);
          return r.json();
        })
        .then(start).catch(fail);
    } else {
      var bin=atob(DATA_GZ), bytes=new Uint8Array(bin.length);
      for(var i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
      new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
        .then(start).catch(fail);
    }
  }catch(e){ fail(e); }
})();
</script>
</body>
</html>`;

const OUT = SERVER
  ? path.join(ROOT, 'page', 'index.html')
  : path.join(ROOT, 'dist', 'flapkap-uae-map.html');
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);

// Server build: the payload the page fetches, beside the page.
if (SERVER) {
  const dataOut = path.join(ROOT, 'data', 'map-page.json');
  fs.writeFileSync(dataOut, JSON.stringify(payload));
  console.log('wrote data/map-page.json  ' + (fs.statSync(dataOut).size / 1024 / 1024).toFixed(1) + ' MB');
}

console.log('pinned companies   ' + pinned.length +
  '   (geocoded ' + pinned.filter(c => c.h === 'geocoded').length +
  ', community ' + pinned.filter(c => c.h === 'community').length + ')');
console.log('with a deal value  ' + pinned.filter(c => c.m).length);
console.log('with an owner      ' + pinned.filter(c => c.o).length);
console.log('universe places    ' + map.universe.length);
console.log('wrote ' + path.relative(ROOT, OUT).replace(/\\/g, '/') +
  '  ' + (fs.statSync(OUT).size / 1024 / 1024).toFixed(1) + ' MB');
