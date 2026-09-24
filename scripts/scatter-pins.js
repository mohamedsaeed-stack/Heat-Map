'use strict';
// Give every allocated company a coordinate to draw at.
//
// The rule the user set on 19 Sep 2026, which SUPERSEDES the earlier "if it has
// no address it is not drawn": a company that we know is in a place goes on the
// map inside that place, flagged as not-exact. What stays banned is inventing a
// PLACE. Scattering inside a real, measured boundary is honest - the company
// genuinely is somewhere in that polygon - as long as the map never implies the
// point is the building.
//
//   exact     a geocoded street address           -> solid pin
//   area      random point inside a real area     -> hollow pin, "area only"
//   emirate   random point inside a real emirate  -> faint pin, "emirate only"
//   uae       random populated point in the UAE   -> faint pin, "UAE only"
//   none      names another country, or nothing  -> NOT drawn, counted
//
// Two properties this guarantees:
//
//   DETERMINISTIC. The offset is seeded from the company's own id, so a pin
//   never moves between rebuilds. A jittered map that reshuffles every build is
//   unreadable and destroys trust in it.
//
//   INSIDE THE REAL SHAPE. Points are rejected until one falls inside the
//   actual polygon, never a bounding box. A Dubai box puts pins in the Gulf; a
//   Fujairah box puts them inside Oman.
//
//   node scripts/scatter-pins.js

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const allocated = JSON.parse(fs.readFileSync(path.join(ROOT, 'raw/allocated.json'), 'utf8'));
const polys = JSON.parse(fs.readFileSync(path.join(ROOT, 'raw/uae-emirate-polygons.json'), 'utf8'));
const areas = JSON.parse(fs.readFileSync(path.join(ROOT, 'raw/uae-area-centroids.json'), 'utf8'));

let geo = {};
try { geo = JSON.parse(fs.readFileSync(path.join(ROOT, 'raw/uae-address-geocodes.json'), 'utf8')); } catch (e) {}

const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

// ---- deterministic RNG ------------------------------------------------------
function seedOf(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- point in polygon -------------------------------------------------------
function inRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    const hit = ((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if (hit) inside = !inside;
  }
  return inside;
}
function inPolygon(lon, lat, coords) {           // coords = [outer, hole, hole...]
  if (!inRing(lon, lat, coords[0])) return false;
  for (let i = 1; i < coords.length; i++) if (inRing(lon, lat, coords[i])) return false;
  return true;
}
function inGeom(lon, lat, g) {
  if (!g) return false;
  if (g.type === 'Polygon') return inPolygon(lon, lat, g.coordinates);
  if (g.type === 'MultiPolygon') return g.coordinates.some(p => inPolygon(lon, lat, p));
  return false;
}

function scatterInGeom(rnd, g, bbox, tries = 400) {
  const [s, n, w, e] = bbox;
  for (let i = 0; i < tries; i++) {
    const lat = s + rnd() * (n - s);
    const lon = w + rnd() * (e - w);
    if (inGeom(lon, lat, g)) return [lat, lon];
  }
  return null;                                    // refuse rather than guess
}

// Areas have a centroid and Nominatim's extent. Pins are spread around the
// centroid as a soft cluster - dense in the middle, thinning outward - never
// wider than the extent or ~2.5 km, and never outside the emirate polygon.
//
// A uniform box was used first. At country zoom it read as a cluster; at
// street zoom it read as a literal square, and on the Al Ain anchor it pushed
// pins across the Oman border (seen by the user, 20 Sep 2026). The gaussian
// shape is still deterministic per company id; it is only presentation, and
// the claim stays "somewhere in this area".
function gauss(rnd) {
  let u = 0, v = 0;
  while (u === 0) u = rnd();
  while (v === 0) v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function scatterInArea(rnd, a, max, geom) {
  const MAX = max || 0.022;                       // ~2.5 km in degrees latitude
  let [s, n, w, e] = a.bbox;
  const cLat = a.lat, cLon = a.lon;
  s = Math.max(s, cLat - MAX); n = Math.min(n, cLat + MAX);
  w = Math.max(w, cLon - MAX); e = Math.min(e, cLon + MAX);
  if (!(n > s && e > w)) { s = cLat - 0.004; n = cLat + 0.004; w = cLon - 0.004; e = cLon + 0.004; }
  const sdLat = (n - s) / 5, sdLon = (e - w) / 5;  // the extent is ~2.5 sigma each side
  let last = null;
  for (let i = 0; i < 60; i++) {
    const lat = cLat + gauss(rnd) * sdLat, lon = cLon + gauss(rnd) * sdLon;
    if (lat < s || lat > n || lon < w || lon > e) continue;
    last = [lat, lon];
    if (!geom || inGeom(lon, lat, geom)) return last;
  }
  // Sixty misses means the anchor sits on or outside the polygon's edge (Ajman
  // is tiny and interleaved with Sharjah; Nominatim's centroid for an Ajman
  // area can fall a street into Sharjah). The centroid is used if it is inside;
  // otherwise the caller falls back a level rather than draw outside the border.
  if (!geom) return last || [cLat, cLon];
  if (inGeom(cLon, cLat, geom)) return [cLat, cLon];
  return null;
}

function main() {
  const areaByKey = new Map();
  for (const [k, v] of Object.entries(areas)) if (!v.refused) areaByKey.set(k, v);

  // The 91 Dubai communities the previous session geocoded. They carry a
  // centroid but no extent, so they get a fixed ~1.2 km spread - tight enough
  // that a pin still reads as that neighbourhood.
  try {
    const cg = JSON.parse(fs.readFileSync(path.join(ROOT, 'raw/communities-geocoded.json'), 'utf8'));
    for (const [name, v] of Object.entries(cg)) {
      if (!v || typeof v.lat !== 'number') continue;
      const lat = v.lat, lon = typeof v.lng === 'number' ? v.lng : v.lon;
      if (typeof lon !== 'number') continue;
      const key = 'Dubai|' + name;
      if (areaByKey.has(key)) continue;
      areaByKey.set(key, { lat, lon, bbox: [lat - 0.011, lat + 0.011, lon - 0.011, lon + 0.011] });
    }
  } catch (e) { /* optional */ }

  // One pool of populated anchor points per emirate, used for emirate-level
  // pins. Any anchor falling outside its own emirate polygon is dropped, so a
  // pin can never be thrown into the sea or across a border by a bad centroid.
  const areaPool = new Map();
  for (const [key, a] of areaByKey) {
    const em = key.split('|')[0];
    const P = polys[em];
    if (P && P.geojson && !inGeom(a.lon, a.lat, P.geojson)) continue;
    if (!areaPool.has(em)) areaPool.set(em, []);
    areaPool.get(em).push(Object.assign({}, a, { emirate: em }));
  }
  console.log('populated anchors per emirate: ' +
    [...areaPool].map(([k, v]) => k + '=' + v.length).join('  '));
  console.log('');

  const stats = { exact: 0, area: 0, emirate: 0, uae: 0, notdrawn_none: 0, notdrawn_unknown: 0, scatter_failed: 0, area_anchor_outside: 0 };
  // Every populated anchor in the country, for pins we can only place at UAE level.
  const allAnchors = [].concat(...[...areaPool.values()]);
  const perEmirate = {};
  const out = [];

  for (const c of allocated) {
    const id = String(c.id);
    const rnd = mulberry32(seedOf(id));
    let lat = null, lon = null, placement = null;

    if (c.emirate) {
      // 1. exact, from a geocoded street address - but only when the geocoder
      //    found a PLACE (a building, shop, office, landmark). An address that is
      //    just a road name ("Sheikh Zayed Road", "Marasi Drive") resolves to one
      //    point on that road, and on 24 Sep 2026 462 companies sat stacked on the
      //    Sheikh Zayed Road point looking like a real cluster. A road hit is
      //    honest only as "somewhere along this road": if the record also names
      //    an area, the area tier below is used; otherwise the pin is spread
      //    around the road point (~1.3 km) and drawn as "area only".
      let roadHit = null;
      if (c.address) {
        const hit = geo[c.emirate + '|' + norm(c.address)];
        if (hit && hit.lat) {
          if (/^(highway|railway)\//.test(hit.cat || '')) roadHit = hit;
          else { lat = hit.lat; lon = hit.lon; placement = 'exact'; }
        }
      }
      // 2. inside the named area
      if (!placement && c.area) {
        const a = areaByKey.get(c.emirate + '|' + c.area);
        if (a) {
          const p = scatterInArea(rnd, a, null, (polys[c.emirate] || {}).geojson);
          if (p) { lat = p[0]; lon = p[1]; placement = 'area'; }
          else stats.area_anchor_outside++;          // falls through to the emirate tier
        }
      }
      // 2b. a road-only geocode with no named area: around the road point.
      if (!placement && roadHit) {
        const G = (polys[c.emirate] || {}).geojson;
        const R = 0.012;
        const p = scatterInArea(rnd, { lat: roadHit.lat, lon: roadHit.lon, bbox: [roadHit.lat - R, roadHit.lat + R, roadHit.lon - R, roadHit.lon + R] }, R, G);
        if (p) { lat = p[0]; lon = p[1]; placement = 'area'; stats.road_as_area = (stats.road_as_area || 0) + 1; }
      }
      // 3. inside the emirate itself, but across the parts of it where
      //    businesses actually are.
      //
      //    Scattering uniformly over the whole polygon was tried first and is
      //    worse, not better. Most of every emirate is empty desert, so a
      //    uniform scatter drew ~20,000 businesses across sand and rendered as
      //    a filled geometric shape rather than a map. It also implies
      //    something false - that our merchants are spread evenly over the
      //    desert - so it is not the "more honest" option, just differently
      //    wrong.
      //
      //    These pins claim ONLY "this company is in this emirate". Where
      //    inside it they are drawn is presentation, and the page says so.
      //    So they are spread over that emirate's known populated areas, which
      //    both matches reality and stops the shape from reading as data.
      if (!placement) {
        const pool = areaPool.get(c.emirate);
        if (pool && pool.length) {
          const G = (polys[c.emirate] || {}).geojson;
          let p = null;
          for (let t = 0; t < 5 && !p; t++) p = scatterInArea(rnd, pool[Math.floor(rnd() * pool.length)], 0.030, G);   // ~3.3 km spread
          if (!p && polys[c.emirate] && polys[c.emirate].geojson) p = scatterInGeom(rnd, polys[c.emirate].geojson, polys[c.emirate].bbox);
          if (p) { lat = p[0]; lon = p[1]; placement = 'emirate'; } else stats.scatter_failed++;
        } else {
          const P = polys[c.emirate];
          if (P && P.geojson) {
            const p = scatterInGeom(rnd, P.geojson, P.bbox);
            if (p) { lat = p[0]; lon = p[1]; placement = 'emirate'; }
            else stats.scatter_failed++;
          }
        }
      }
    }

    // 4. UAE, but no source names an emirate. The user's rule, 19 Sep 2026:
    //    place it at the closest thing we DO know and flag it, rather than
    //    leaving it off the map entirely. The closest thing we know here is
    //    "the UAE", so the pin goes at a random populated point in the country
    //    and is labelled UNTRACEABLE. It carries no information below national
    //    level and the page says exactly that.
    if (!placement && c.precision === 'uae') {
      const a = allAnchors[Math.floor(rnd() * allAnchors.length)];
      let p = null;
      for (let t = 0; t < 5 && !p; t++) { const a2 = allAnchors[Math.floor(rnd() * allAnchors.length)]; if (a2) p = scatterInArea(rnd, a2, 0.030, (polys[a2.emirate] || {}).geojson); }
      if (p) { lat = p[0]; lon = p[1]; placement = 'uae'; }
    }

    if (placement) {
      stats[placement]++;
      const key = c.emirate || 'UAE (untraceable)';
      perEmirate[key] = perEmirate[key] || { exact: 0, area: 0, emirate: 0, uae: 0 };
      perEmirate[key][placement]++;
    } else if (c.unknown) stats.notdrawn_unknown++; else stats.notdrawn_none++;

    out.push({
      id: c.id, name: c.name, industry: c.industry, stage: c.lifecyclestage,
      emirate: c.emirate, area: c.area, route: c.route, src: c.src || null,
      lat: lat === null ? null : Number(lat.toFixed(6)),
      lon: lon === null ? null : Number(lon.toFixed(6)),
      placement,
      unknown: !!c.unknown, nolocation: !!c.nolocation, delta: !!c.delta, conflict: !!c.conflict,
      adminFunded: !!c.adminFunded, adminId: c.adminId || null,
      adminIndustry: c.adminIndustry || null, disbursed: c.disbursed || null,
    });
  }

  const pad = (s, n) => String(s).padEnd(n);
  const num = n => n.toLocaleString().padStart(8);

  console.log('PLACEMENT');
  console.log('  ' + pad('exact (geocoded address)', 30) + num(stats.exact));
  console.log('  ' + pad('area scatter', 30) + num(stats.area));
  console.log('  ' + pad('emirate scatter', 30) + num(stats.emirate));
  console.log('  ' + pad('UAE only (untraceable)', 30) + num(stats.uae));
  console.log('  ' + pad('DRAWN TOTAL', 30) + num(stats.exact + stats.area + stats.emirate + stats.uae));
  console.log('  ' + pad('not drawn - names another country', 36) + num(stats.notdrawn_none));
  console.log('  ' + pad('not drawn - location unknown', 36) + num(stats.notdrawn_unknown));
  if (stats.area_anchor_outside) console.log('  ' + pad('area anchor outside its emirate -> emirate tier', 48) + num(stats.area_anchor_outside));
  if (stats.scatter_failed) console.log('  ' + pad('scatter failed', 36) + num(stats.scatter_failed));
  if (stats.scatter_failed) console.log('  ' + pad('scatter FAILED', 30) + num(stats.scatter_failed));
  console.log('');
  console.log('PER EMIRATE            exact     area  emirate');
  for (const [em, v] of Object.entries(perEmirate).sort((a, b) => {
    const t = x => x[1].exact + x[1].area + x[1].emirate; return t(b) - t(a);
  })) {
    console.log('  ' + pad(em, 20) + String(v.exact).padStart(6) + String(v.area).padStart(9) + String(v.emirate).padStart(9));
  }

  fs.writeFileSync(path.join(ROOT, 'raw/pins.json'), JSON.stringify(out));
  console.log('');
  console.log('wrote raw/pins.json');
}

main();
