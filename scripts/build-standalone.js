'use strict';
// Build dist/flapkap-dubai-map.html - ONE file, opens by double-click.
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
const map = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'map.json'), 'utf8'));

const pinned = map.companies.filter(c => c.y != null);

const LAYERS = [
  { key: 'closed_won',  label: 'Closed won',  color: '#0b8043', r: 8 },
  { key: 'in_process',  label: 'In process',  color: '#1a73e8', r: 7 },
  { key: 'closed_lost', label: 'Closed lost', color: '#d93025', r: 6 },
  { key: 'crm',         label: 'On the CRM',  color: '#7d8894', r: 4 },
];
const CAT_COLOR = {
  hospitality_fnb: '#e8590c', medical_healthcare: '#1098ad', marketing_advertising: '#c2255c',
  auto_automotive: '#2f9e44', contracting_fitout: '#6741d9', retail: '#b58900',
  manufacturing_trading: '#ae3ec9', other: '#7a8699', blank: '#9aa4b2',
};

const payload = {
  pulled: map.stats.pulled,
  companies: pinned,
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
<title>FlapKap &mdash; Dubai Coverage Map</title>
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
    <div class="h-title">FlapKap &middot; Dubai Coverage Map</div>
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

  <h4>Categories</h4>
  <div class="cats" id="cats"></div>

  <div class="muted" id="locnote"></div>
</div>

<div class="note" id="note"></div>

<script>${V('leaflet.min.js')}</script>
<script>${V('leaflet.markercluster.min.js')}</script>
<script>var DATA = ${JSON.stringify(payload)};</script>
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

  var map = L.map('map',{zoomControl:true,preferCanvas:false}).setView([25.15,55.28],11);
  L.control.scale({imperial:false}).addTo(map);

  var tileLayer=null,curBase=null;
  function setBase(k){
    if(curBase===k) return;
    if(tileLayer) map.removeLayer(tileLayer);
    var b=BASEMAPS.filter(function(x){return x.k===k;})[0];
    tileLayer=L.tileLayer(b.url,{maxZoom:b.max,attribution:b.attr}).addTo(map);
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
  var crmGroup=L.markerClusterGroup({chunkedLoading:true,maxClusterRadius:42,showCoverageOnHover:false,
    disableClusteringAtZoom:16,iconCreateFunction:clusterIcon('rgba(26,115,232,.86)')});
  var uniGroup=L.markerClusterGroup({chunkedLoading:true,maxClusterRadius:60,showCoverageOnHover:false,
    disableClusteringAtZoom:17,iconCreateFunction:clusterIcon('rgba(0,150,148,.80)')});

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
    var loc = c.h==='geocoded'
      ? 'Street address geocoded from OpenStreetMap.'
      : 'No street address on the CRM &mdash; placed on the '+esc(c.a||'')+' area centroid, not an exact location.';
    return '<div class="pn">'+esc(c.n)+'</div>'+
      '<div class="pi">'+esc(DATA.categories[c.c]||c.c)+(c.a?' &middot; '+esc(c.a):'')+'</div>'+
      '<span class="pb" style="background:'+color+'">'+esc(STAGE[c.l])+(c.t==='risk_rejected'?' &middot; Risk':'')+'</span>'+
      (kv?'<dl class="kv">'+kv+'</dl>':'')+
      '<div class="pnote">'+loc+(c.lc?' Marked a customer by lifecycle stage, with no won deal attached.':'')+
      '<div class="pid">HubSpot company '+esc(c.i)+'</div></div>';
  }

  function drawCRM(){
    crmGroup.clearLayers(); markerIndex=[];
    var shown=0;
    DATA.companies.forEach(function(c){
      if(!on[c.l]||!catOn[c.c]) return;
      var L0=BY_KEY[c.l]; if(!L0) return;
      shown++;
      var color = (c.l==='closed_lost'&&c.t==='risk_rejected') ? '#f9ab00' : L0.color;
      var m=L.circleMarker([c.y,c.x],{radius:radiusFor(c,L0.r),color:'#fff',weight:2,opacity:1,
        fillColor:color,fillOpacity:.95});
      m.bindPopup(popupFor(c,color));
      if(showLabels) m.bindTooltip(c.n,{permanent:true,direction:'right',offset:[6,0],className:'lbl'});
      else m.bindTooltip(c.n,{direction:'top',className:'lbl'});
      crmGroup.addLayer(m);
      markerIndex.push({c:c,m:m});
    });
    if(!map.hasLayer(crmGroup)) map.addLayer(crmGroup);
    return shown;
  }

  function drawUniverse(){
    uniGroup.clearLayers();
    if(!on.universe){ if(map.hasLayer(uniGroup)) map.removeLayer(uniGroup); return; }
    DATA.universe.forEach(function(p){
      if(!catOn[p.c]) return;
      var m=L.circleMarker([p.y,p.x],{radius:3.5,color:'#fff',weight:1,opacity:.9,
        fillColor:CAT_COLOR[p.c]||'#009694',fillOpacity:.85});
      m.bindPopup('<div class="pn">'+esc(p.n)+'</div><div class="pi">'+esc(DATA.categories[p.c]||p.c)+
        ' &middot; '+esc(String(p.k).replace(/_/g,' '))+'</div>'+
        '<div class="pnote">Market universe, from OpenStreetMap. Not a CRM record.</div>');
      if(showLabels) m.bindTooltip(p.n,{permanent:true,direction:'right',offset:[5,0],className:'lbl'});
      else m.bindTooltip(p.n,{direction:'top',className:'lbl'});
      uniGroup.addLayer(m);
    });
    if(!map.hasLayer(uniGroup)) map.addLayer(uniGroup);
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

  function renderStats(){
    var s=DATA.stats.crm;
    var rows=[
      {n:fmt(s.byLayer.closed_won||0),l:'Closed won',c:'#0b8043',a:aed(s.wonAmount)},
      {n:fmt(s.byLayer.in_process||0),l:'In process',c:'#1a73e8',a:aed(s.pipelineAmount)},
      {n:fmt(s.byLayer.closed_lost||0),l:'Closed lost',c:'#d93025',a:aed(s.lostAmount)},
      {n:fmt(s.total),l:'On the CRM',c:'#7d8894',a:null}
    ];
    document.getElementById('stats').innerHTML=rows.map(function(r){
      return '<div class="stat"><div class="num" style="color:'+r.c+'">'+r.n+'</div>'+
        '<div class="lbl">'+r.l+'</div>'+(r.a?'<div class="amt">'+r.a+'</div>':'')+'</div>';}).join('');
  }

  function redraw(){
    var shown=drawCRM(); drawUniverse(); renderStats();
    var s=DATA.stats.crm, pin=s.byLocation.geocoded+s.byLocation.community;
    document.getElementById('locnote').innerHTML=
      '<b>'+fmt(shown)+'</b> of <b>'+fmt(pin)+'</b> locatable companies drawn. '+
      fmt(s.byLocation.unlocated)+' hold no usable address and are counted but not drawn.';
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
        crmGroup.zoomToShowLayer(h.m,function(){ h.m.openPopup(); });
      };});
  };

  document.getElementById('labels').onchange=function(e){ showLabels=e.target.checked; redraw(); };
  document.getElementById('heat').onchange=function(e){ sizeByValue=e.target.checked; redraw(); };

  var s=DATA.stats.crm;
  document.getElementById('sub').textContent =
    'CRM snapshot '+DATA.pulled+' \\u00b7 '+fmt(s.total)+' companies \\u00b7 '+
    fmt(DATA.stats.deals.total)+' deals \\u00b7 '+fmt(DATA.universe.length)+' businesses from OpenStreetMap';

  document.getElementById('note').innerHTML =
    '<span class="x" onclick="this.parentNode.style.display=\\'none\\'">&times;</span>'+
    '<b>Every pin is a real record.</b> Green is a funded client, blue an open deal, red a loss, '+
    'amber a Risk rejection, grey a CRM company with no deal. Click any pin for its deal value, stage, '+
    'owner and close date. '+fmt(s.byLocation.geocoded)+' sit at a geocoded street address; '+
    fmt(s.byLocation.community)+' on their area centroid because the CRM has no street address for them.';

  renderLegend(); renderCats(); redraw();

  // The container has no size until layout settles. Fitting before that lands on
  // the whole world, which is what happened the first time.
  function fit(){
    map.invalidateSize();
    var pts=DATA.companies.map(function(c){return [c.y,c.x];});
    if(pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.03));
  }
  if(document.readyState==='complete') setTimeout(fit,60);
  else window.addEventListener('load',function(){ setTimeout(fit,60); });
})();
</script>
</body>
</html>`;

const OUT = path.join(ROOT, 'dist', 'flapkap-dubai-map.html');
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);

console.log('pinned companies   ' + pinned.length +
  '   (geocoded ' + pinned.filter(c => c.h === 'geocoded').length +
  ', community ' + pinned.filter(c => c.h === 'community').length + ')');
console.log('with a deal value  ' + pinned.filter(c => c.m).length);
console.log('with an owner      ' + pinned.filter(c => c.o).length);
console.log('universe places    ' + map.universe.length);
console.log('wrote dist/flapkap-dubai-map.html  ' + (fs.statSync(OUT).size / 1024 / 1024).toFixed(1) + ' MB');
