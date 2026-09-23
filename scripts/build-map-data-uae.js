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

// The admin app's industry picklist, for the funded clients HubSpot has no
// record of. Everything not listed is "other"; nothing is "blank" if a value exists.
const ADMIN_CATEGORY = {
  FOODSERVICE_HOSPITALITY: 'hospitality_fnb', RESTAURANTS: 'hospitality_fnb', CATERING: 'hospitality_fnb', HOTELS: 'hospitality_fnb',
  FOOD_BEVERAGE_RETAIL: 'retail', RETAIL: 'retail', E_COMMERCE: 'retail', FASHION_RETAIL: 'retail', GROCERY: 'retail',
  HEALTHCARE_PROVIDERS: 'medical_healthcare', HEALTHCARE: 'medical_healthcare', PHARMACY: 'medical_healthcare', CLINICS: 'medical_healthcare',
  CONSTRUCTION_CONTRACTING: 'contracting_fitout', PROPERTY_MAINTENANCE: 'contracting_fitout', INTERIOR_FITOUT: 'contracting_fitout', BUILDING_MATERIALS: 'contracting_fitout',
  MARKETING_ADVERTISING: 'marketing_advertising', MEDIA: 'marketing_advertising', EVENTS: 'marketing_advertising',
  AUTO_REPAIR: 'auto_automotive', AUTOMOTIVE: 'auto_automotive', AUTO_PARTS: 'auto_automotive', CAR_RENTAL: 'auto_automotive',
  MANUFACTURING: 'manufacturing_trading', OTHER_LIGHT_MANUFACTURING: 'manufacturing_trading', PLASTICS_PAPER_RUBBER: 'manufacturing_trading',
  TRADING: 'manufacturing_trading', OTHER_TRADE: 'manufacturing_trading', GENERAL_TRADING: 'manufacturing_trading', WHOLESALE: 'manufacturing_trading',
  IT_SOFTWARE_DATA: 'it_software', SOFTWARE: 'it_software', TECHNOLOGY: 'it_software',
};
function adminCategoryOf(v) {
  if (!v) return null;
  const k = String(v).toUpperCase();
  return ADMIN_CATEGORY[k] || 'other';
}

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

let excludedNotUAE = 0, excludedUnknown = 0, adminOnlyFunded = 0;
const emirateByAdmin = new Map();
// HubSpot company -> admin client, from the name join, so the page can link a
// joined record to its admin-app client page as well as to HubSpot.
const adminIdByHs = new Map();
try {
  for (const [hsId, v] of Object.entries(JSON.parse(fs.readFileSync(path.join(ROOT, 'raw/admin-match.json'), 'utf8'))))
    if (v && v.adminId) adminIdByHs.set(String(hsId), v.adminId);
} catch (e) { /* no join file */ }
// The funded book as the admin app holds it: how many clients, how many of them
// are Egyptian merchants (outside a UAE map), how many are UAE. Measured from the
// per-client pull, 20 Sep 2026.
const fundedScope = { total: 372, foreign: 0, uae: 372 };
try {
  const lic = JSON.parse(fs.readFileSync(path.join(ROOT, 'raw/admin-licence-emirate.json'), 'utf8'));
  fundedScope.total = lic.length;
  fundedScope.foreign = lic.filter(r => r.foreign).length;
  fundedScope.uae = fundedScope.total - fundedScope.foreign;
} catch (e) { /* pull not run yet */ }
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

  // A funded client the admin app knows and HubSpot does not. There is no deal
  // record to carry, so the pin says only what the admin app says: funded,
  // when last disbursed, which industry. No money, no owner, no stage.
  const adminOnly = !!p.adminFunded && !old;
  if (adminOnly) adminOnlyFunded++;

  // The record's own industry value wins over the Dubai build's stored bucket,
  // so re-bucketing (IT & software became category 8 on 19 Sep) takes effect
  // everywhere instead of only on records pulled since. The stored bucket is
  // the fallback for records that carry no industry.
  const fromIndustry = p.industry ? categoryOf(p.industry) : adminCategoryOf(p.adminIndustry);
  const cat = (fromIndustry && fromIndustry !== 'blank') ? fromIndustry
            : (old && old.c ? old.c : 'blank');
  const layer = adminOnly ? 'closed_won' : (old && old.l ? old.l : 'crm');

  // Copy the Dubai build's record WHOLESALE rather than re-listing its fields.
  // Its keys are terse and easy to mistake for each other - `m` is the deal
  // VALUE and `d` is the deal COUNT, not the other way round - and guessing
  // them wrong silently zeroes the money on the page.
  const rec = old ? Object.assign({}, old) : {
    i: String(p.id), n: null, c: cat, l: 'crm',
    s: null, m: null, o: null, t: null, r: null, cd: null,
    d: 0, lc: 0, ad: 0, af: 0, src: 'hubspot', hs: null, ai: null,
  };

  // Which emirate each funded client's pin sits in, for the outstanding book.
  // Kept here, never written to the record: the page needs the totals, not the id.
  if (p.adminId) emirateByAdmin.set(p.adminId, p.emirate || 'UAE, emirate unknown');

  rec.i = String(p.id);
  if (p.name) rec.n = p.name;
  rec.c = cat;
  if (!rec.l) rec.l = 'crm';
  if (adminOnly) {
    rec.l = 'closed_won'; rec.src = 'admin'; rec.ao = 1; rec.ad = 1; rec.af = 1;
    rec.ai = p.adminIndustry || null; rec.cd = p.disbursed || null;
    rec.aid = p.adminId || null;
  } else if (p.adminId || adminIdByHs.has(String(p.id))) {
    rec.aid = p.adminId || adminIdByHs.get(String(p.id));      // joined: both links
  }
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

// ---- one pin per company per place ---------------------------------------------
// Mohamed, 23 Sep 2026: no duplicate pins. The same company can sit in HubSpot
// twice, or once in HubSpot and once in the admin app, and each copy was a pin.
// Records with the same name (legal suffixes and punctuation ignored) in the
// same emirate are one company; the copies collapse into the best-located one,
// which takes the most advanced stage across the copies (won > lost > in process
// > on the CRM; the admin app's verdict wins). Copies in DIFFERENT areas of an
// emirate, or at different street addresses, are branches and stay separate.
// A record with no area merges into a sibling that has one. Names that are job
// titles, not companies ("Chief Executive Officer" x12) are left alone and
// reported - they are a HubSpot data problem, not duplicates of each other.
const GENERIC_NAMES = new Set(['chief executive officer', 'ceo', 'owner', 'founder', 'manager', 'director',
  'general manager', 'managing director', 'test', 'n a', 'na', 'none', 'unknown', 'company', 'business']);
const normName = v => String(v || '').toLowerCase().replace(/&/g, ' and ')
  .replace(/[^a-z0-9\u0600-\u06FF ]+/g, ' ')
  .replace(/\b(l ?l ?c|fzco|fze|fz|fzc|llc|ltd|limited|inc|co|company|trading|tr|est|establishment|general|gen|dmcc|jlt|sole proprietorship|s p c|spc|plc|group)\b/g, ' ')
  .replace(/\s+/g, ' ').trim();
const STAGE_RANK = { closed_won: 3, closed_lost: 2, in_process: 1, crm: 0 };
const PREC_RANK = { exact: 3, area: 2, emirate: 1, uae: 0 };
const dedup = { groups: 0, removed: 0, genericNames: {}, crossSystem: 0 };
{
  const byKey = new Map();
  for (const c of companies) {
    const k = normName(c.n);
    if (!k) continue;
    if (GENERIC_NAMES.has(k)) { dedup.genericNames[c.n] = (dedup.genericNames[c.n] || 0) + 1; continue; }
    const key = k + '|' + (c.e || '');
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(c);
  }
  const drop = new Set();
  for (const group of byKey.values()) {
    if (group.length < 2) continue;
    // Split the emirate group into places: an exact address is its own place, a
    // named area is a place, and records with neither attach to whichever
    // place exists (or form one place together).
    const places = new Map();
    const loose = [];
    for (const c of group) {
      if (c.a) { const pk = 'a:' + c.a; if (!places.has(pk)) places.set(pk, []); places.get(pk).push(c); }
      else if (c.h === 'exact') places.set('x:' + c.y + ',' + c.x, [c]);
      else loose.push(c);
    }
    if (loose.length) {
      if (places.size === 0) places.set('e', loose);
      else [...places.values()][0].push(...loose);   // a copy with no area joins the first known place
    }
    // Inside one area, exact pins at different street addresses are branches;
    // the copies without an address join the first of them.
    const merges = [];
    for (const list of places.values()) {
      const exacts = list.filter(c => c.h === 'exact');
      const byXY = new Map();
      for (const e of exacts) { const k = e.y + ',' + e.x; if (!byXY.has(k)) byXY.set(k, []); byXY.get(k).push(e); }
      if (byXY.size > 1) {
        const branches = [...byXY.values()];
        branches[0].push(...list.filter(c => c.h !== 'exact'));
        merges.push(...branches);
      } else merges.push(list);
    }
    for (const copies of merges) {
      if (copies.length < 2) continue;
      dedup.groups++;
      if (copies.some(c => c.ao) && copies.some(c => !c.ao)) dedup.crossSystem++;
      copies.sort((a, b) => (STAGE_RANK[b.l] - STAGE_RANK[a.l]) || (PREC_RANK[b.h] - PREC_RANK[a.h]));
      const keep = copies[0];
      const bestLoc = copies.slice().sort((a, b) => PREC_RANK[b.h] - PREC_RANK[a.h])[0];
      // location from the best-located copy; stage, money and links merged in
      keep.y = bestLoc.y; keep.x = bestLoc.x; keep.h = bestLoc.h; keep.a = bestLoc.a || keep.a; keep.rt = bestLoc.rt || keep.rt;
      for (const c of copies.slice(1)) {
        if (!keep.aid && c.aid) keep.aid = c.aid;
        if (keep.ao && !c.ao) { keep.i = c.i; keep.ao = 0; }        // an admin-only winner adopts the HubSpot id, so both links show
        if (!keep.m && c.m) { keep.m = c.m; keep.s = keep.s || c.s; keep.o = keep.o || c.o; keep.cd = keep.cd || c.cd; keep.d = c.d || keep.d; }
        if (c.ad) keep.ad = 1; if (c.af) keep.af = 1;
        if (c.ao || c.src === 'admin') keep.src = 'admin';
        if (c.hs && !keep.hs) keep.hs = c.hs;
        drop.add(c);
        dedup.removed++;
      }
    }
  }
  if (drop.size) {
    for (let i = companies.length - 1; i >= 0; i--) if (drop.has(companies[i])) companies.splice(i, 1);
    // the tallies were built per pin above; rebuild them from what is left
    for (const k of Object.keys(byEmirate)) delete byEmirate[k];
    for (const k of Object.keys(byPlacement)) byPlacement[k] = 0;
    for (const k of Object.keys(byLayer)) delete byLayer[k];
    for (const k of Object.keys(byCategory)) delete byCategory[k];
    for (const c of companies) {
      const em = c.e || 'UAE, emirate unknown';
      byEmirate[em] = byEmirate[em] || { total: 0, exact: 0, area: 0, emirate: 0, uae: 0, notdrawn: 0 };
      byEmirate[em].total++; byEmirate[em][c.h] = (byEmirate[em][c.h] || 0) + 1;
      byPlacement[c.h] = (byPlacement[c.h] || 0) + 1;
      byLayer[c.l] = (byLayer[c.l] || 0) + 1;
      byCategory[c.c] = (byCategory[c.c] || 0) + 1;
    }
  }
  console.log('duplicates: ' + dedup.groups + ' companies had more than one pin in the same place; ' + dedup.removed + ' pins merged away (' + dedup.crossSystem + ' groups spanned HubSpot and the admin app); job-title names left alone: ' + JSON.stringify(dedup.genericNames));
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
const money = { won: 0, open: 0, lost: 0, wonN: 0, openN: 0, lostN: 0, wonNoValue: 0 };
for (const c of companies) {
  if (c.l === "closed_won") { money.won += c.m || 0; money.wonN++; if (!c.m) money.wonNoValue++; }
  else if (c.l === "in_process") { money.open += c.m || 0; money.openN++; }
  else if (c.l === "closed_lost") { money.lost += c.m || 0; money.lostN++; }
}

// OpenStreetMap names occasionally carry a phone number typed into the name
// field. The page promises no phone numbers anywhere, so they are stripped.
const stripPhone = v => v == null ? v : String(v).replace(/\+?\d[\d\s().-]{7,}\d/g, '').replace(/\s{2,}/g, ' ').trim();

// ---- outstanding book, emirate level ------------------------------------------
// Balances are pulled one funded client at a time into raw/admin-balances.json
// ([{id, outstanding, asOf}]) and aggregated HERE, before anything reaches the
// page: no merchant's balance is written to data/ or drawn, only emirate totals.
// Mohamed's decision, 20 Sep 2026: emirate level, all seven emirates. Emirates
// with fewer than 5 funded clients are merged into one row so that no row can be
// read back to a single client. Clients whose pin is foreign are excluded.
let book = null;
try {
  const bal = JSON.parse(fs.readFileSync(path.join(ROOT, 'raw/admin-balances.json'), 'utf8'));
  const rows = {}; let asOf = null, withBalance = 0, noBalance = 0, notOnMap = 0;
  for (const b of bal) {
    if (!b || !b.id) continue;
    if (b.asOf && (!asOf || b.asOf > asOf)) asOf = b.asOf;
    const em = emirateByAdmin.get(b.id);
    if (!em) { notOnMap++; continue; }
    if (typeof b.outstanding !== 'number') { noBalance++; continue; }
    withBalance++;
    rows[em] = rows[em] || { emirate: em, clients: 0, outstanding: 0 };
    rows[em].clients++; rows[em].outstanding += b.outstanding;
  }
  const MIN = 5;
  const shown = [], merged = { emirate: 'Other emirates (fewer than ' + MIN + ' clients each)', clients: 0, outstanding: 0, merged: [] };
  for (const r of Object.values(rows)) {
    if (r.clients >= MIN) shown.push(r);
    else { merged.clients += r.clients; merged.outstanding += r.outstanding; merged.merged.push(r.emirate); }
  }
  shown.sort((a, b) => b.outstanding - a.outstanding);
  // A merged row of a single emirate would still be that emirate; only show it when it hides two or more.
  if (merged.clients > 0 && (merged.merged.length >= 2 || merged.clients >= MIN)) shown.push(merged);
  const total = Object.values(rows).reduce((s, r) => s + r.outstanding, 0);
  book = { asOf, rows: shown, total, clientsWithBalance: withBalance, clientsNoBalance: noBalance, clientsNotOnMap: notOnMap, minClients: MIN,
           suppressedClients: merged.clients > 0 && !(merged.merged.length >= 2 || merged.clients >= MIN) ? merged.clients : 0 };
  console.log('outstanding book: ' + withBalance + ' clients with a balance, ' + noBalance + ' without, ' + notOnMap + ' not on the map; ' + shown.length + ' rows');
} catch (e) { /* no balances pulled yet: the page hides the panel */ }

// ---- market universe, every emirate that has been pulled -----------------------
// One summary per emirate (data/universe-<slug>.json, written by
// pull-osm-universe.js) lists that emirate's category files. Every place gets
// its emirate so the page's emirate chips filter it like a CRM pin. Dubai was
// the only emirate until 23 Sep 2026; the other six were pulled that day
// (lookups/osm-universe-counts.json has the counts measured beforehand).
const universe = [];
const universeByEmirate = {};
{
  const areas = JSON.parse(fs.readFileSync(path.join(ROOT, 'lookups/uae-emirate-areas.json'), 'utf8')).emirates;
  for (const emirate of Object.keys(areas)) {
    const slug = emirate.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const sumFile = path.join(ROOT, 'data', 'universe-' + slug + '.json');
    if (!fs.existsSync(sumFile)) continue;
    const sum = JSON.parse(fs.readFileSync(sumFile, 'utf8'));
    let n = 0;
    for (const [key, meta] of Object.entries(sum.categories || {})) {
      if (!meta.file) continue;
      const catFile = path.join(ROOT, 'data', meta.file);
      if (!fs.existsSync(catFile)) continue;
      for (const p of JSON.parse(fs.readFileSync(catFile, 'utf8')).places) {
        universe.push({ n: stripPhone(p.n), y: p.y, x: p.x, c: key, k: p.k, e: emirate });
        n++;
      }
    }
    universeByEmirate[emirate] = n;
  }
}

const out = {
  companies,
  universe,
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
    // Funded clients: how many the map now carries, and how many of those exist
    // only in the admin app (no HubSpot record, so no deal value).
    fundedOnMap: companies.filter(c => c.af).length,
    adminOnlyFunded,
    fundedScope,
    book,
    dedup: { groups: dedup.groups, removed: dedup.removed, crossSystem: dedup.crossSystem, genericNames: dedup.genericNames },
    money,
    universeScope: Object.keys(universeByEmirate).length === 7 ? 'all seven emirates' : Object.keys(universeByEmirate).join(', '),
    universeByEmirate,
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
console.log('funded clients on the map ' + companies.filter(c => c.af).length.toLocaleString() + ' against ' + fundedScope.uae + ' UAE funded (' + fundedScope.total + ' minus ' + fundedScope.foreign + ' foreign), of which ' + adminOnlyFunded.toLocaleString() + ' are admin-app-only pins');
console.log('the 8,040 no-location companies: drawn ' + noLoc.drawn.toLocaleString() + ', foreign ' + noLoc.foreign.toLocaleString() + ', still unknown ' + noLoc.unknown.toLocaleString() + ' = ' + (noLoc.drawn + noLoc.foreign + noLoc.unknown).toLocaleString());
console.log('universe          ' + num(universe.length) + '   ' + Object.entries(universeByEmirate).map(([k, v]) => k + ' ' + v.toLocaleString()).join(' · '));
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
