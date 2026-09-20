'use strict';
// Build the UAE-wide data file the page publishes.
//
// It folds three things together:
//   raw/pins.json     every allocated company and the coordinate to draw it at
//   data/map.json     the Dubai build's per-company DEAL and ADMIN findings -
//                     layer, stage, deal value, owner, loss reason. That logic
//                     was hard won (five pipelines, three loss taxonomies, the
//                     admin app outranking HubSpot on won and lost) and is
//                     reused by company id rather than re-derived.
//   universe          the 18,018 OpenStreetMap businesses, DUBAI ONLY. The user
//                     parked market-universe discovery outside Dubai until the
//                     CRM/admin side is finished, so the other six emirates
//                     deliberately show only what we actually hold.
//
// A company present in pins.json but not in the Dubai build is a new record -
// it keeps layer "crm" unless a deal or admin status says otherwise.
//
//   node scripts/build-map-data-uae.js

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const R = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));

const pins = R('raw/pins.json');
const prev = R('data/map.json');
const industryMap = R('lookups/industry-map.json').map || {};
const places = R('lookups/uae-places.json');

// ---- per-company findings from the Dubai build, by id ------------------------
const prevById = new Map();
for (const c of prev.companies) prevById.set(String(c.i), c);

function categoryOf(industry) {
  if (!industry) return 'blank';
  const key = String(industry).replace(/&amp;/g, '&');
  return industryMap[key] || industryMap[key.toUpperCase()] || 'other';
}

// ---- companies ---------------------------------------------------------------
const companies = [];
const byEmirate = {};
const byPlacement = { exact: 0, area: 0, emirate: 0, uae: 0, notdrawn: 0 };
const byLayer = {};
const byCategory = {};

let excludedNotUAE = 0, excludedUnknown = 0;
// The 8,040 that said nothing about where they are, split by what became of them.
const noLoc = { drawn: 0, unknown: 0, foreign: 0 };
for (const p of pins) {
  if (p.nolocation) { if (p.placement) noLoc.drawn++; else if (p.unknown) noLoc.unknown++; else noLoc.foreign++; }
  // Companies that are not in the UAE at all are DROPPED, by the user's
  // instruction of 19 Sep 2026: "the ones who are not totally in the UAE,
  // there is no need to include them."
  //
  // After the UAE-level tier was added, every company with any UAE evidence at
  // all gets drawn - so an undrawn record is now, by definition, one that said
  // it is somewhere else. These are real foreign companies: New York, London,
  // Cairo, Mumbai, San Jose. They are counted here and nowhere else.
  //
  // Since 20 Sep 2026 there is a second kind of undrawn record: one of the
  // no-location companies that nothing at all could place. Those are UNKNOWN,
  // counted apart, and never called foreign.
  if (!p.placement) { if (p.unknown) excludedUnknown++; else excludedNotUAE++; continue; }

  const old = prevById.get(String(p.id));

  // The record's own industry value wins over the Dubai build's stored bucket,
  // so re-bucketing (IT & software became category 8 on 19 Sep) takes effect
  // everywhere instead of only on records pulled since. The stored bucket is
  // the fallback for records that carry no industry.
  const fromIndustry = p.industry ? categoryOf(p.industry) : null;
  const cat = (fromIndustry && fromIndustry !== 'blank') ? fromIndustry
            : (old && old.c ? old.c : 'blank');
  const layer = old && old.l ? old.l : 'crm';

  // Copy the Dubai build's record WHOLESALE rather than re-listing its fields.
  // Its keys are terse and easy to mistake for each other - `m` is the deal
  // VALUE and `d` is the deal COUNT, not the other way round - and guessing
  // them wrong silently zeroes the money on the page.
  const rec = old ? Object.assign({}, old) : {
    i: String(p.id), n: null, c: cat, l: 'crm',
    s: null, m: null, o: null, t: null, r: null, cd: null,
    d: 0, lc: 0, ad: 0, af: 0, src: 'hubspot', hs: null, ai: null,
  };

  rec.i = String(p.id);
  if (p.name) rec.n = p.name;
  rec.c = cat;
  if (!rec.l) rec.l = 'crm';
  // Geography is always taken from the new allocation, which supersedes the
  // Dubai-only placement.
  rec.y = p.lat; rec.x = p.lon;
  rec.h = p.placement || 'unlocated';   // exact | area | emirate | unlocated
  rec.e = p.emirate || null;
  rec.a = p.area || null;
  rec.rt = p.route || null;             // which evidence placed it

  for (const k of Object.keys(rec)) if (rec[k] === null || rec[k] === undefined) delete rec[k];
  companies.push(rec);

  const em = p.emirate || (p.placement ? 'UAE, emirate unknown' : 'not UAE');
  byEmirate[em] = byEmirate[em] || { total: 0, exact: 0, area: 0, emirate: 0, uae: 0, notdrawn: 0 };
  byEmirate[em].total++;
  if (p.placement) { byEmirate[em][p.placement]++; byPlacement[p.placement]++; }
  else { byEmirate[em].notdrawn++; byPlacement.notdrawn++; }

  byLayer[layer] = (byLayer[layer] || 0) + 1;
  byCategory[cat] = (byCategory[cat] || 0) + 1;
}

// ---- areas: rank by how many companies sit in each ---------------------------
const areas = {};
for (const c of companies) {
  if (!c.a || !c.e) continue;
  const k = c.e + ' — ' + c.a;
  areas[k] = areas[k] || { emirate: c.e, area: c.a, companies: 0, won: 0, open: 0, lost: 0 };
  areas[k].companies++;
  if (c.l === 'closed_won') areas[k].won++;
  else if (c.l === 'in_process') areas[k].open++;
  else if (c.l === 'closed_lost') areas[k].lost++;
}

// ---- deal money, carried through -------------------------------------------
const money = { won: 0, open: 0, lost: 0, wonN: 0, openN: 0, lostN: 0 };
for (const c of companies) {
  if (c.l === "closed_won") { money.won += c.m || 0; money.wonN++; }
  else if (c.l === "in_process") { money.open += c.m || 0; money.openN++; }
  else if (c.l === "closed_lost") { money.lost += c.m || 0; money.lostN++; }
}

// OpenStreetMap names occasionally carry a phone number typed into the name
// field. The page promises no phone numbers anywhere, so they are stripped.
const stripPhone = v => v == null ? v : String(v).replace(/\+?\d[\d\s().-]{7,}\d/g, '').replace(/\s{2,}/g, ' ').trim();

const out = {
  companies,
  universe: prev.universe.map(u => Object.assign({}, u, { n: stripPhone(u.n) })),   // Dubai only, by decision
  areas,
  emirates: byEmirate,
  // The page reads stats.crm.* and stats.categories, so the Dubai build's shape
  // is kept and its counts overridden. New UAE-only figures are added beside
  // it rather than replacing it.
  stats: Object.assign({}, prev.stats, {
    built: new Date().toISOString().slice(0, 10),
    // Category 8. The page reads stats.categories for labels and
    // stats.targetCategories for which chips to show, so both must learn it.
    categories: Object.assign({}, prev.stats.categories, { it_software: 'IT & software' }),
    targetCategories: (prev.stats.targetCategories || []).concat(
      (prev.stats.targetCategories || []).includes('it_software') ? [] : ['it_software']),
    crm: Object.assign({}, prev.stats.crm, {
      total: companies.length,
      byLayer,
      byCategory,
      byLocation: byPlacement,
    }),
    total: companies.length,
    drawn: byPlacement.exact + byPlacement.area + byPlacement.emirate + byPlacement.uae,
    byPlacement,
    byEmirate,
    byLayer,
    byCategory,
    excludedNotUAE,
    excludedUnknown,
    money,
    universeScope: 'Dubai only',
    // The whole CRM, split three ways, so the map's total is never mistaken
    // for the portal's. Measured against HubSpot on 19 Sep 2026; the three
    // rows below add to 47,516 exactly.
    crmScope: {
      total: 47516,
      uaeCountry: 29355,      // country field says United Arab Emirates
      elsewhere: 9974,        // country field names another country
      noCountry: 8187,        // no country at all
      noLocationAtAll: 8040,  // …and no city, state, address or zip either (measured 19 Sep)
      // What became of those 8,040. The page's "Location unknown" tile shows the
      // still-unknown figure, because the drawn ones ARE on the map now.
      noLocationDrawn: noLoc.drawn,
      noLocationForeign: noLoc.foreign,
      noLocationStillUnknown: noLoc.unknown,
      noLocationNoContacts: 795, // …and no contacts to ask, so nothing to go on
      onMap: byPlacement.exact + byPlacement.area + byPlacement.emirate + byPlacement.uae,
    },
    emirateCentroids: Object.fromEntries(
      Object.entries(places.emirates).map(([k, v]) => [k, v.centroid])),
  }),
};

fs.writeFileSync(path.join(ROOT, 'data/map-uae.json'), JSON.stringify(out));

const num = n => Number(n).toLocaleString().padStart(9);
console.log('companies on the map ' + num(companies.length));
console.log('  drawn          ' + num(out.stats.drawn));
console.log('    exact        ' + num(byPlacement.exact));
console.log('    area         ' + num(byPlacement.area));
console.log('    emirate      ' + num(byPlacement.emirate));
console.log('    UAE only     ' + num(byPlacement.uae));
console.log('  excluded, not UAE ' + num(excludedNotUAE) + '   (dropped entirely)');
console.log('  excluded, unknown ' + num(excludedUnknown) + '   (no-location companies nothing could place)');
console.log('the 8,040 no-location companies: drawn ' + noLoc.drawn.toLocaleString() + ', foreign ' + noLoc.foreign.toLocaleString() + ', still unknown ' + noLoc.unknown.toLocaleString() + ' = ' + (noLoc.drawn + noLoc.foreign + noLoc.unknown).toLocaleString());
console.log('universe (Dubai) ' + num(prev.universe.length));
console.log('areas ranked     ' + num(Object.keys(areas).length));
console.log('');
console.log('LAYERS');
for (const [k, v] of Object.entries(byLayer).sort((a, b) => b[1] - a[1])) console.log('  ' + k.padEnd(16) + num(v));
console.log('');
console.log('MONEY  won ' + (money.won / 1e6).toFixed(1) + 'M (' + money.wonN + ')  open ' +
  (money.open / 1e6).toFixed(1) + 'M (' + money.openN + ')  lost ' +
  (money.lost / 1e6).toFixed(1) + 'M (' + money.lostN + ')');
console.log('');
console.log('wrote data/map-uae.json  ' +
  (fs.statSync(path.join(ROOT, 'data/map-uae.json')).size / 1024 / 1024).toFixed(1) + ' MB');
