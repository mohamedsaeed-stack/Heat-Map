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

const ROOT = path.join(__dirname, '..');
const V = f => fs.readFileSync(path.join(ROOT, 'page', 'vendor', f), 'utf8');
const map = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'map-uae.json'), 'utf8'));

const pinned = map.companies.filter(c => c.y != null);

const LAYERS = [
  { key: 'closed_won',  label: 'Closed won',  color: '#0b8043', r: 9 },
  { key: 'in_process',  label: 'In process',  color: '#f5a623', r: 8 },
  { key: 'closed_lost', label: 'Closed lost', color: '#d93025', r: 7 },
  { key: 'crm',         label: 'On the CRM',  color: '#9aa0a6', r: 6 },
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
if (fs.existsSync(TILE_DIR)) {
  for (const f of fs.readdirSync(TILE_DIR)) {
    if (!f.endsWith('.png')) continue;
    TILES[f.replace(/.png$/, '')] = fs.readFileSync(path.join(TILE_DIR, f)).toString('base64');
  }
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

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FlapKap &mdash; UAE Coverage Map</title>
<style>
${V('leaflet.min.css')}
${V('MarkerCluster.css')}
${V('MarkerCluster.Default.css')}
</style>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{height:100%}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;background:#f5f5f3;color:#111;overflow:hidden}

  .header{background:#fff;border-bottom:1px solid #e5e5e3;padding:9px 18px;display:flex;align-items:center;
    justify-content:space-between;gap:14px;position:absolute;top:0;left:0;right:0;height:52px;z-index:1200}
  .h-title{font-size:15px;font-weight:600;white-space:nowrap}
  .h-sub{font-size:11px;color:#8a8a8a;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .legend{display:flex;gap:14px;align-items:center;flex-wrap:wrap}
  .lg{display:flex;align-items:center;gap:6px;font-size:12px;color:#555;cursor:pointer;user-select:none;white-space:nowrap}
  .lg .dot{width:13px;height:13px;border-radius:50%;border:2px solid rgba(255,255,255,.9);
    box-shadow:0 1px 3px rgba(0,0,0,.25);flex-shrink:0}
  .lg.off{opacity:.32}
  .lg .n{font-variant-numeric:tabular-nums;color:#9a9a9a;font-size:11px}

  #map{position:absolute;top:52px;left:0;right:0;bottom:0}

  .stats{position:absolute;top:64px;left:12px;z-index:1000;display:flex;flex-direction:column;gap:7px}
  .stat{background:#fff;border-radius:10px;padding:8px 12px;box-shadow:0 2px 8px rgba(0,0,0,.12);min-width:148px}
  .stat .num{font-size:20px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1.15}
  .stat .lbl{font-size:10.5px;color:#8a8a8a;margin-top:1px}
  .stat .amt{font-size:10.5px;color:#666;margin-top:3px;font-variant-numeric:tabular-nums}

  .panel{position:absolute;top:64px;right:12px;z-index:1000;background:#fff;border-radius:10px;
    box-shadow:0 2px 8px rgba(0,0,0,.12);padding:10px 12px;width:242px;font-size:12px;
    max-height:calc(100% - 80px);overflow-y:auto}
  .panel h4{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#9a9a9a;margin-bottom:6px;font-weight:600}
  .panel h4:not(:first-child){margin-top:11px}
  .bmrow{display:flex;gap:4px}
  .bm{flex:1;font:inherit;font-size:11px;padding:5px 4px;border:1px solid #e3e3e1;background:#fff;
    border-radius:6px;cursor:pointer;color:#666}
  .bm.on{background:#1a73e8;border-color:#1a73e8;color:#fff}
  .cats{display:flex;flex-wrap:wrap;gap:4px}
  .cat{font:inherit;font-size:10.5px;padding:3px 8px;border-radius:20px;border:1px solid #e3e3e1;
    background:#fff;cursor:pointer;color:#666;display:flex;align-items:center;gap:5px}
  .cat.on{color:#fff;border-color:transparent}
  .cat .cn{font-variant-numeric:tabular-nums;opacity:.85}
  .row{display:flex;align-items:center;gap:7px;padding:3px 0;font-size:11.5px;color:#555;cursor:pointer}
  .row input{margin:0}
  .muted{color:#9a9a9a;font-size:10.5px;line-height:1.5;margin-top:8px}
  .muted b{color:#444}

  .searchbox{width:100%;font:inherit;font-size:12px;padding:6px 9px;border:1px solid #e3e3e1;border-radius:7px}
  .hits{margin-top:5px;max-height:150px;overflow-y:auto}
  .hit{padding:4px 6px;border-radius:5px;cursor:pointer;font-size:11.5px;color:#444}
  .hit:hover{background:#f1f3f4}
  .hit i{font-style:normal;color:#9a9a9a;font-size:10.5px}

  .note{position:absolute;left:12px;bottom:14px;z-index:1000;background:#fff;border-radius:10px;
    box-shadow:0 2px 8px rgba(0,0,0,.12);padding:9px 12px;max-width:390px;font-size:11px;color:#666;
    border-left:3px solid #f9ab00;line-height:1.5}
  .note b{color:#111}
  .note .x{float:right;cursor:pointer;color:#bbb;margin-left:8px;font-weight:600}

  .leaflet-popup-content-wrapper{border-radius:10px!important;box-shadow:0 4px 20px rgba(0,0,0,.18)!important}
  .leaflet-popup-content{margin:12px 14px!important;font-family:inherit;min-width:210px}
  .pn{font-size:14px;font-weight:600;color:#111;margin-bottom:3px;line-height:1.3}
  .pi{font-size:11px;color:#8a8a8a;margin-bottom:7px}
  .pb{display:inline-block;font-size:11px;font-weight:600;padding:3px 9px;border-radius:20px;color:#fff}
  .kv{display:grid;grid-template-columns:auto 1fr;gap:2px 10px;margin-top:8px;font-size:11.5px}
  .kv dt{color:#9a9a9a}
  .kv dd{color:#333;font-variant-numeric:tabular-nums}
  .pnote{font-size:10.5px;color:#999;line-height:1.45;margin-top:8px;border-top:1px solid #eee;padding-top:6px}
  .pid{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:10px;color:#bbb;margin-top:3px}

  .lbl{background:rgba(255,255,255,.92);border:1px solid rgba(0,0,0,.12);border-radius:4px;
    padding:1px 5px;font-size:11px;color:#222;font-weight:500;white-space:nowrap;
    box-shadow:0 1px 3px rgba(0,0,0,.15)}
  .lbl:before{display:none}
  .marker-cluster div{font-family:inherit;font-weight:600}

  .i{width:15px;height:15px;border-radius:50%;border:1px solid #c5c8cc;background:#fff;color:#80868b;
    font-size:10px;font-weight:700;line-height:1;cursor:pointer;padding:0;font-family:inherit;flex-shrink:0}
  .i:hover{border-color:#1a73e8;color:#1a73e8}
  .stat .lbl{display:flex;align-items:center;gap:5px;justify-content:space-between}
  dialog.info{border:1px solid #e3e3e1;border-radius:12px;padding:0;max-width:520px;width:calc(100% - 32px);
    background:#fff;color:#111;box-shadow:0 12px 40px rgba(0,0,0,.25)}
  dialog.info::backdrop{background:rgba(0,0,0,.45)}
  .ih{padding:15px 18px 0;font-size:15px;font-weight:650}
  .ib{padding:8px 18px 14px;font-size:12.5px;color:#444;line-height:1.55}
  .ib dt{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#9aa0a6;font-weight:600;margin-top:12px}
  .ib dd{margin:3px 0 0}
  .ib code{display:block;background:#f6f8fa;border:1px solid #e8eaed;border-radius:6px;padding:7px 9px;
    font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11px;color:#1a1a1a;white-space:pre-wrap;
    margin-top:4px;line-height:1.45}
  .if{padding:0 18px 15px;text-align:right}
  .ibtn{font:inherit;font-size:12px;padding:6px 15px;border-radius:99px;background:#1a73e8;color:#fff;border:0;cursor:pointer}

  @media(max-width:820px){
    .header{height:auto;padding:8px 12px;flex-direction:column;align-items:flex-start;gap:6px}
    #map{top:96px}
    .stats{top:108px;left:8px}
    .stat{min-width:120px;padding:6px 9px}
    .stat .num{font-size:16px}
    .panel{top:108px;right:8px;width:180px}
    .note{display:none}
  }
</style>
</head>
<body>

<div class="header">
  <div style="min-width:0">
    <div class="h-title">FlapKap &middot; UAE Coverage Map</div>
    <div class="h-sub" id="sub">&nbsp;</div>
  </div>
  <div class="legend" id="legend"></div>
</div>

<div id="map"></div>
<div class="stats" id="stats"></div>

<div class="panel">
  <h4>Find a business</h4>
  <input class="searchbox" id="q" placeholder="Type a name&hellip;" autocomplete="off">
  <div class="hits" id="hits"></div>

  <h4>Base map</h4>
  <div class="bmrow" id="basemaps"></div>

  <h4>Display</h4>
  <label class="row"><input type="checkbox" id="labels"> Show business names</label>
  <label class="row"><input type="checkbox" id="heat"> Size pins by deal value</label>
  <label class="row"><input type="checkbox" id="cluster"> Group nearby pins</label>

  <h4>Emirate</h4>
  <div class="cats" id="ems"></div>

  <h4>How exact is the pin?</h4>
  <div class="cats" id="prec"></div>
  <div class="muted" style="margin-top:4px">A solid dot with a white ring is a real street address. Faded, ringless pins are scattered inside the area or emirate we know the business is in &mdash; they are not the building.</div>

  <h4>Categories</h4>
  <div class="cats" id="cats"></div>

  <div class="muted" id="locnote"></div>
</div>

<div class="note" id="note"></div>

<dialog class="info" id="dlg">
  <div class="ih" id="dlgh"></div>
  <div class="ib" id="dlgb"></div>
  <div class="if"><button class="ibtn" id="dlgx">Close</button></div>
</dialog>

<script>${V('leaflet.min.js')}</script>
<script>${V('leaflet.markercluster.min.js')}</script>
<script>var DATA = ${JSON.stringify(payload)};
// Expand the dictionary-encoded fields back to their real values, so every
// other line below sees the same shape the Dubai build produced.
(function(){
  var D=DATA.dict||{}, C=DATA.companies, ks=Object.keys(D);
  for(var i=0;i<C.length;i++){
    var c=C[i];
    for(var j=0;j<ks.length;j++){ var k=ks[j]; if(typeof c[k]==='number') c[k]=D[k][c[k]]; }
    if(c.lc===undefined)c.lc=0; if(c.ad===undefined)c.ad=0;
    if(c.af===undefined)c.af=0; if(c.d===undefined)c.d=0;
  }
})();</script>
<script>var TILES = ${JSON.stringify(TILES)};</script>
<script>
(function(){
  var LAYERS = ${JSON.stringify(LAYERS)};
  var CAT_COLOR = ${JSON.stringify(CAT_COLOR)};
  var BY_KEY = {}; LAYERS.forEach(function(l){ BY_KEY[l.key]=l; });

  var BASEMAPS = [
    {k:'streets',label:'Streets',url:'https://tile.openstreetmap.org/{z}/{x}/{y}.png',max:19,
     attr:'&copy; OpenStreetMap contributors'},
    {k:'detailed',label:'Detailed',url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',max:19,
     attr:'Esri, HERE, Garmin'},
    {k:'satellite',label:'Satellite',url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',max:19,
     attr:'Esri, Maxar, Earthstar Geographics'}
  ];

  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];});}
  function fmt(n){return (n==null?0:n).toLocaleString('en-US');}
  function aed(n){
    if(n==null) return null;
    if(n>=1e6) return 'AED ' + (n/1e6).toFixed(n>=1e7?0:1) + 'M';
    if(n>=1e3) return 'AED ' + Math.round(n/1e3) + 'K';
    return 'AED ' + fmt(n);
  }

  var map = L.map('map',{zoomControl:true,preferCanvas:true}).setView([25.05,55.45],9);
  L.control.scale({imperial:false}).addTo(map);

  // Embedded first, network second. A blocked or absent network changes
  // nothing inside the covered area.
  var EmbeddedTiles = L.TileLayer.extend({
    getTileUrl: function(c){
      var k = c.z + '_' + c.x + '_' + c.y;
      if (TILES[k]) return 'data:image/png;base64,' + TILES[k];
      return L.TileLayer.prototype.getTileUrl.call(this, c);
    }
  });
  var tileLayer=null,curBase=null;
  function setBase(k){
    if(curBase===k) return;
    if(tileLayer) map.removeLayer(tileLayer);
    var b=BASEMAPS.filter(function(x){return x.k===k;})[0];
    tileLayer=(b.k==='streets'?new EmbeddedTiles(b.url,{maxZoom:b.max,maxNativeZoom:13,attribution:b.attr})
                              :L.tileLayer(b.url,{maxZoom:b.max,attribution:b.attr})).addTo(map);
    tileLayer.bringToBack(); curBase=k;
    Array.prototype.forEach.call(document.querySelectorAll('.bm'),function(el){
      el.className='bm'+(el.getAttribute('data-k')===k?' on':'');});
  }
  document.getElementById('basemaps').innerHTML = BASEMAPS.map(function(b){
    return '<button class="bm" data-k="'+b.k+'">'+b.label+'</button>';}).join('');
  Array.prototype.forEach.call(document.querySelectorAll('.bm'),function(el){
    el.onclick=function(){ setBase(el.getAttribute('data-k')); };});
  setBase('streets');

  var on={closed_won:true,in_process:true,closed_lost:true,crm:true,universe:false};
  var catOn={}; DATA.target.forEach(function(c){catOn[c]=true;}); catOn.other=true; catOn.blank=true;
  // Emirate filter, and a filter on HOW WELL a pin is located. The second one
  // matters: switching off "emirate only" leaves just the pins whose position
  // is actually meaningful, which is the honest view of the map.
  var EMIRATES=Object.keys(DATA.stats.byEmirate||{}).filter(function(k){return k!=='unplaced'&&k!=='not UAE';});
  var emOn={}; EMIRATES.forEach(function(e){emOn[e]=true;}); emOn.Unknown=true;
  var PREC=[['exact','Exact address'],['area','Area only'],['emirate','Emirate only'],['uae','UAE — emirate unknown']];
  var precOn={exact:true,area:true,emirate:true,uae:true};
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
  var crmPlain=L.layerGroup();
  var crmCluster=L.markerClusterGroup({chunkedLoading:true,maxClusterRadius:42,showCoverageOnHover:false,
    disableClusteringAtZoom:16,iconCreateFunction:clusterIcon('rgba(26,115,232,.86)')});
  var uniPlain=L.layerGroup();
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
    if(c.m) kv+='<dt>Deal value</dt><dd>'+esc(aed(c.m))+'</dd>';
    if(c.s) kv+='<dt>Stage</dt><dd>'+esc(c.s)+'</dd>';
    if(c.o) kv+='<dt>Owner</dt><dd>'+esc(c.o)+'</dd>';
    if(c.cd) kv+='<dt>Close date</dt><dd>'+esc(c.cd)+'</dd>';
    if(c.r) kv+='<dt>Reason</dt><dd>'+esc(c.r)+'</dd>';
    if(c.d) kv+='<dt>Deals</dt><dd>'+c.d+'</dd>';
    if(c.ai) kv+='<dt>Admin industry</dt><dd>'+esc(String(c.ai).replace(/_/g,' ').toLowerCase())+'</dd>';
    var dis = c.hs ? '<div class="pnote" style="border-top-color:#f9ab00;color:#8a6d00">HubSpot still has this as <b>'+esc(STAGE[c.hs])+'</b>. The admin app is authoritative for won and lost, so the map follows it.</div>' : '';
    var loc = (c.h==='exact'||c.h==='geocoded')
      ? '<b>Exact.</b> Street address geocoded against OpenStreetMap.'
      : c.h==='named'
      ? 'Located by matching the business name to an OpenStreetMap record.'
      : c.h==='area'
      ? '<b>Approximate &mdash; area only.</b> No street address on record. This pin is placed at a random point inside <b>'+esc(c.a||'')+'</b>, which is where we know the business is. It is <i>not</i> the building.'
      : c.h==='uae'
      ? '<b>UAE, emirate unknown.</b> This company&rsquo;s own record says its country is the United Arab Emirates, but nothing names an emirate — not its record, not its contacts, not its website. The pin sits at a random populated point in the country. It confirms the UAE and tells you <i>nothing</i> below that.'
      : c.h==='emirate'
      ? '<b>Approximate &mdash; emirate only.</b> No street address and no area on record. This pin is placed at a random point inside <b>'+esc(c.e||'')+'</b>. All it tells you is the emirate.'
      : 'No usable location on record.';
    if(c.rt) loc += '<br><span class="muted">Placed via: '+esc(c.rt)+'</span>';
    return '<div class="pn">'+esc(c.n)+'</div>'+
      '<div class="pi">'+esc(DATA.categories[c.c]||c.c)+(c.a?' &middot; '+esc(c.a):'')+'</div>'+
      '<span class="pb" style="background:'+color+'">'+esc(STAGE[c.l])+(c.t==='risk_rejected'?' &middot; Risk':'')+'</span>'+
      (c.src==='admin'?' <span class="pb" style="background:#5f6368">per the admin app</span>':'')+
      (kv?'<dl class="kv">'+kv+'</dl>':'')+dis+
      '<div class="pnote">'+loc+(c.lc?' Marked a customer by lifecycle stage, with no won deal attached.':'')+
      '<div class="pid">HubSpot company '+esc(c.i)+'</div></div>';
  }

  function drawCRM(){
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
      var L0=BY_KEY[c.l]; if(!L0) return;
      shown++;
      var color = (c.l==='closed_lost'&&c.t==='risk_rejected') ? '#f9ab00' : L0.color;
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
      var fo = quiet?.62:.95;
      if(area) fo*=.85; if(vague) fo*=.7; if(untraced) fo*=.62;
      var m=L.circleMarker([c.y,c.x],{
        radius: radiusFor(c,quiet?4:L0.r) * (untraced?.7:(vague?.85:(area?.92:1))),
        color: (area||vague)?color:'#fff',
        weight: vague?0.5:(area?1:(quiet?1:2)),
        opacity: (area||vague)?.65:(quiet?.75:1),
        fillColor:color, fillOpacity:fo});
      m.bindPopup(popupFor(c,color));
      if(showLabels) m.bindTooltip(c.n,{permanent:true,direction:'right',offset:[6,0],className:'lbl'});
      else m.bindTooltip(c.n,{direction:'top',className:'lbl'});
      target.addLayer(m);
      markerIndex.push({c:c,m:m});
    });
    if(!map.hasLayer(target)) map.addLayer(target);
    return shown;
  }

  function drawUniverse(){
    uniPlain.clearLayers(); uniCluster.clearLayers();
    if(!on.universe){ if(map.hasLayer(uniPlain)) map.removeLayer(uniPlain); if(map.hasLayer(uniCluster)) map.removeLayer(uniCluster); return; }
    var utarget=uniGroupNow(), uother=clusterOn?uniPlain:uniCluster;
    if(map.hasLayer(uother)) map.removeLayer(uother);
    DATA.universe.forEach(function(p){
      if(!catOn[p.c]) return;
      var m=L.circleMarker([p.y,p.x],{radius:3.5,color:'#fff',weight:1,opacity:.9,
        fillColor:CAT_COLOR[p.c]||'#009694',fillOpacity:.85});
      m.bindPopup('<div class="pn">'+esc(p.n)+'</div><div class="pi">'+esc(DATA.categories[p.c]||p.c)+
        ' &middot; '+esc(String(p.k).replace(/_/g,' '))+'</div>'+
        '<div class="pnote">Market universe, from OpenStreetMap. Not a CRM record.</div>');
      if(showLabels) m.bindTooltip(p.n,{permanent:true,direction:'right',offset:[5,0],className:'lbl'});
      else m.bindTooltip(p.n,{direction:'top',className:'lbl'});
      utarget.addLayer(m);
    });
    if(!map.hasLayer(utarget)) map.addLayer(utarget);
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

  function renderCats(){
    var keys=DATA.target.concat(['other','blank']);
    document.getElementById('cats').innerHTML=keys.map(function(k){
      var style=catOn[k]?' style="background:'+(CAT_COLOR[k]||'#666')+'"':'';
      return '<button class="cat'+(catOn[k]?' on':'')+'" data-k="'+k+'"'+style+'>'+
        esc(DATA.categories[k]||k)+' <span class="cn">'+fmt(DATA.stats.crm.byCategory[k]||0)+'</span></button>';}).join('');
    Array.prototype.forEach.call(document.querySelectorAll('.cat'),function(el){
      el.onclick=function(){ catOn[el.getAttribute('data-k')]=!catOn[el.getAttribute('data-k')]; renderCats(); redraw(); };});
  }

  function renderEms(){
    var be=DATA.stats.byEmirate||{};
    document.getElementById('ems').innerHTML=EMIRATES.map(function(k){
      var n=be[k]?be[k].total:0;
      return '<button class="cat'+(emOn[k]?' on':'')+'" data-k="'+esc(k)+'"'+
        (emOn[k]?' style="background:#37474f"':'')+'>'+esc(k)+
        ' <span class="cn">'+fmt(n)+'</span></button>';}).join('');
    Array.prototype.forEach.call(document.getElementById('ems').querySelectorAll('.cat'),function(el){
      el.onclick=function(){var k=el.getAttribute('data-k');emOn[k]=!emOn[k];renderEms();redraw();};});
  }
  function renderPrec(){
    var bp=DATA.stats.byPlacement||{};
    document.getElementById('prec').innerHTML=PREC.map(function(p){
      return '<button class="cat'+(precOn[p[0]]?' on':'')+'" data-k="'+p[0]+'"'+
        (precOn[p[0]]?' style="background:#455a64"':'')+'>'+esc(p[1])+
        ' <span class="cn">'+fmt(bp[p[0]]||0)+'</span></button>';}).join('');
    Array.prototype.forEach.call(document.getElementById('prec').querySelectorAll('.cat'),function(el){
      el.onclick=function(){var k=el.getAttribute('data-k');precOn[k]=!precOn[k];renderPrec();redraw();};});
  }

  var INFO={
    placement:{h:'How pins are placed',b:function(){var b=DATA.stats.byPlacement||{};var s=DATA.stats;return ''+
      '<dl><dt>The number</dt><dd><b>'+fmt(s.drawn)+'</b> of '+fmt(s.total)+' companies are drawn. '+fmt(b.notdrawn||0)+' are counted but not drawn.</dd>'+
      '<dt>How a pin is placed</dt><dd><code>1 street address  -> exact point   '+fmt(b.exact||0)+'\\n2 known area      -> inside area   '+fmt(b.area||0)+'\\n3 emirate only    -> inside emirate '+fmt(b.emirate||0)+'\\n4 nothing usable  -> not drawn    '+fmt(b.notdrawn||0)+'</code></dd>'+
      '<dt>Why this way</dt><dd>A company we know is in Al Quoz but have no address for is drawn <i>inside Al Quoz</i>, at a point chosen from its own record id so it never moves between rebuilds. The place is real and measured; only the exact spot within it is not. Nothing is ever drawn in a place we did not verify.</dd>'+
      '<dt>What would make it wrong</dt><dd>Reading a faded pin as a real address. Only '+fmt(b.exact||0)+' pins are true geocoded addresses &mdash; switch off the other precision filters to see just those. An emirate-only pin tells you the emirate and nothing more.</dd></dl>';}},

    scope:{h:'What this map is NOT showing',b:function(){var s=DATA.stats.crmScope;if(!s)return '';return ''+
      '<dl><dt>The whole CRM, split three ways</dt><dd><code>says United Arab Emirates  '+fmt(s.uaeCountry)+'\\nsays somewhere else       '+fmt(s.elsewhere)+'\\nsays nothing at all       '+fmt(s.noCountry)+'\\n                        --------\\ntotal in HubSpot          '+fmt(s.total)+'</code></dd>'+
      '<dt>This map shows the first group</dt><dd><b>'+fmt(s.onMap)+'</b> companies. The '+fmt(s.elsewhere)+' that name another country are out of scope &mdash; this is a UAE map, and a company in Philadelphia or Cairo is not the market.</dd>'+
      '<dt>The ones nobody can place</dt><dd><b>'+fmt(s.noLocationAtAll)+'</b> companies say <i>nothing</i> about where they are &mdash; no city, no country, no region, no address, no postcode. They are not on this map and they are not counted as UAE, because nothing says they are. <b>They might be. '+fmt(s.noLocationNoContacts)+' of them have no contacts either</b>, so there is nothing left to ask.</dd>'+
      '<dt>Why this matters</dt><dd>'+fmt(s.noLocationAtAll)+' is 17% of the CRM sitting in the dark. If even half of them are Emirati, this map is missing thousands of real UAE companies &mdash; not because they could not be placed, but because nobody filled in a field. That is a CRM hygiene number, not a mapping one.</dd></dl>';}},

    closed_won:{h:'Closed won',b:function(){var s=DATA.stats.crm;return ''+
      '<dl><dt>What it counts</dt><dd>Businesses that have actually been funded.</dd>'+
      '<dt>Formula</dt><dd><code>admin.financingStatus = REFINANCING\\n  OR HubSpot stage = Money Disbursed\\n  OR HubSpot lifecyclestage = customer</code></dd>'+
      '<dt>Why this way</dt><dd>You said the admin app is more reliable than HubSpot for won and lost, so it overrides the deal stage. '+fmt(s.adminOverrode||0)+' companies were reclassified by it.</dd>'+
      '<dt>What would make it wrong</dt><dd>REFINANCING marks a client who is refinancing, so it catches those funded at least once. The admin app has no DISBURSED status. Read this as a floor, not a total.</dd></dl>';}},

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

    pins:{h:'Why only some are pinned',b:function(){var s=DATA.stats.crm;return ''+
      '<dl><dt>The number</dt><dd><b>'+fmt(s.byLocation.geocoded+(s.byLocation.named||0)+s.byLocation.community)+'</b> of '+fmt(s.total)+' companies can be placed. '+fmt(s.byLocation.unlocated)+' cannot.</dd>'+
      '<dt>How a pin is placed</dt><dd><code>1 street address -> geocoded    '+fmt(s.byLocation.geocoded)+'\\n2 business name  -> OSM match    '+fmt(s.byLocation.named||0)+'\\n3 address text   -> area centre  '+fmt(s.byLocation.community)+'\\n4 otherwise      -> not drawn    '+fmt(s.byLocation.unlocated)+'</code></dd>'+
      '<dt>Why so many cannot be placed</dt><dd>Only about a quarter of companies hold a street address, and 41% of those resolve in OpenStreetMap. '+fmt(s.genericAddressesRefused||0)+' more say only "Dubai" or "UAE", which would geocode to the city centre and stack unrelated businesses on one point, so they are refused.</dd>'+
      '<dt>Routes already tried</dt><dd>Contacts were checked as a fallback: <b>only 53 contacts in the whole CRM carry a street address</b>, so they can confirm a company is in the UAE but cannot place one. Paid lookups such as Google Places are excluded by the no-credits rule.</dd>'+
      '<dt>What would make it wrong</dt><dd>An area-centroid pin marks the AREA, not the building. No coordinate here is guessed.</dd></dl>';}}
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
    if(sc) rows.push({k:'scope',n:fmt(sc.noLocationAtAll),l:'Location unknown',c:'#b06000',
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
    var s=DATA.stats.crm, pin=s.byLocation.geocoded+s.byLocation.community;
    document.getElementById('locnote').innerHTML=
      'Drawing <b>'+fmt(shown)+'</b> pins from the layers you have switched on. '+
      '<b>'+fmt(pin)+'</b> companies have a location in total &mdash; '+
      fmt(s.byLocation.geocoded)+' from a geocoded street address, '+
      fmt(s.byLocation.named||0)+' matched by name to an OpenStreetMap business, '+
      fmt(s.byLocation.community)+' on an area centroid. '+
      fmt(s.byLocation.unlocated)+' could not be placed at all. '+
      '<button class="i" id="ipins" title="Why">i</button>';
    var ip=document.getElementById('ipins'); if(ip) ip.onclick=function(){ openInfo('pins'); };
  }

  // search
  document.getElementById('q').oninput=function(e){
    var q=e.target.value.trim().toLowerCase();
    var box=document.getElementById('hits');
    if(q.length<2){ box.innerHTML=''; return; }
    var hits=markerIndex.filter(function(x){return x.c.n.toLowerCase().indexOf(q)>=0;}).slice(0,25);
    box.innerHTML=hits.map(function(x,i){
      return '<div class="hit" data-i="'+i+'">'+esc(x.c.n)+' <i>'+esc(STAGE[x.c.l])+'</i></div>';}).join('')
      || '<div class="hit"><i>No pinned business matches</i></div>';
    Array.prototype.forEach.call(box.querySelectorAll('.hit[data-i]'),function(el){
      el.onclick=function(){
        var h=hits[Number(el.getAttribute('data-i'))];
        map.flyTo([h.c.y,h.c.x],17,{duration:.7});
        if(clusterOn) crmCluster.zoomToShowLayer(h.m,function(){ h.m.openPopup(); });
        else h.m.openPopup();
      };});
  };

  document.getElementById('labels').onchange=function(e){ showLabels=e.target.checked; redraw(); };
  document.getElementById('heat').onchange=function(e){ sizeByValue=e.target.checked; redraw(); };
  document.getElementById('cluster').onchange=function(e){ clusterOn=e.target.checked; redraw(); };

  var s=DATA.stats.crm;
  document.getElementById('sub').textContent =
    'CRM snapshot '+DATA.pulled+' \\u00b7 '+fmt(s.total)+' companies \\u00b7 '+
    fmt(DATA.stats.deals.total)+' deals \\u00b7 '+fmt(DATA.universe.length)+' businesses from OpenStreetMap';

  document.getElementById('note').innerHTML =
    '<span class="x" onclick="this.parentNode.style.display=\\'none\\'">&times;</span>'+
    '<b>Every pin is a real record.</b> Green is a funded client, blue an open deal, red a loss, '+
    'amber a Risk rejection. The grey <b>On the CRM</b> layer is '+fmt(s.byLayer.crm||0)+' companies and '+
    'starts switched off because it covers the city - click it in the legend to bring it in. '+
    'Click any pin for its deal value, stage, '+
    'owner and close date. '+fmt(s.byLocation.geocoded)+' sit at a geocoded street address; '+
    fmt(s.byLocation.community)+' on their area centroid because the CRM has no street address for them.';

  var disN=DATA.companies.filter(function(c){return c.hs;}).length;
  if(disN) document.getElementById('note').innerHTML += ' <b>'+disN+' pinned businesses are classified differently by the two systems</b> — the admin app wins on won and lost.';
  renderLegend(); renderCats(); renderEms(); renderPrec(); redraw();

  // The container has no size until layout settles. Fitting before that lands on
  // the whole world, which is what happened the first time.
  function pct(arr,p){ var a=arr.slice().sort(function(x,y){return x-y;}); return a[Math.floor((a.length-1)*p)]; }
  function fit(){
    map.invalidateSize();
    var lats=DATA.companies.map(function(c){return c.y;});
    var lngs=DATA.companies.map(function(c){return c.x;});
    if(!lats.length) return;
    // A FIXED country view. fitBounds was tried and abandoned: it reads the
    // container size at call time and got it wrong twice, once landing on the
    // whole world and once on a single street.
    //
    // The median pin is not used either, now the scope is the UAE - 80% of the
    // pins are in Dubai, so the median opens on Dubai and hides the other six
    // emirates the map now covers. This centre and zoom show Abu Dhabi through
    // Ras Al Khaimah in one view, which is the point of the page.
    map.setView([25.05,55.35], 8);
  }
  if(document.readyState==='complete') setTimeout(fit,60);
  else window.addEventListener('load',function(){ setTimeout(fit,60); });
})();
</script>
</body>
</html>`;

const OUT = path.join(ROOT, 'dist', 'flapkap-uae-map.html');
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);

console.log('pinned companies   ' + pinned.length +
  '   (geocoded ' + pinned.filter(c => c.h === 'geocoded').length +
  ', community ' + pinned.filter(c => c.h === 'community').length + ')');
console.log('with a deal value  ' + pinned.filter(c => c.m).length);
console.log('with an owner      ' + pinned.filter(c => c.o).length);
console.log('universe places    ' + map.universe.length);
console.log('wrote dist/flapkap-uae-map.html  ' + (fs.statSync(OUT).size / 1024 / 1024).toFixed(1) + ' MB');
