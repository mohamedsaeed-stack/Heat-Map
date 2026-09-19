'use strict';
// Turn the raw pulls into the one dataset the map draws.
//
//   node scripts/build-map-data.js
//
// Layer assignment, highest priority first: closed won, in process, closed
// lost, then plain CRM. A company with both a won deal and a lost deal is a
// customer, not a loss.
//
// Locating, in strict order, and never invented:
//   1. geocoded  - a real coordinate from Nominatim for this company's address
//   2. community - the address text names a Dubai community, so the pin sits on
//                  that community's OSM centroid. Approximate, and the popup
//                  says so.
//   3. unlocated - counted, never drawn.
//
// GENERIC ADDRESSES ARE REFUSED. A CRM address of "Dubai" or "UAE" geocodes
// happily to the city centre, which would stack hundreds of unrelated companies
// on one point and read as a real cluster. Those fall through to the community
// pass or stay unlocated.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { locate } = require(path.join(ROOT, 'scripts', 'lib', 'communities.js'));
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const companies = read('raw/hubspot-companies.json');
const deals = read('raw/hubspot-deals.json');
const comms = read('data/communities.json');
const imap = read('lookups/industry-map.json');
const stageMap = read('lookups/stage-map.json');
const ownersFile = read('lookups/owners.json');
const adminMatch = fs.existsSync(path.join(ROOT,'raw','admin-match.json')) ? read('raw/admin-match.json') : {};
const geocoded = fs.existsSync(path.join(ROOT, 'raw', 'address-geocodes.json'))
  ? read('raw/address-geocodes.json') : {};

// ---------------------------------------------------------------- owners
const ownerName = {};
const ownerList = Array.isArray(ownersFile.owners) ? ownersFile.owners : Object.values(ownersFile.owners || {});
for (const o of ownerList) if (o && o.id) ownerName[String(o.id)] = o.name;

// ---------------------------------------------------------------- generic addresses
// Anything that names no street, building or district is not a location.
const GENERIC = new Set([
  'dubai', 'dubai uae', 'dubai, uae', 'dubai, united arab emirates', 'dubai - united arab emirates',
  'uae', 'u.a.e', 'u.a.e.', 'united arab emirates', 'dubai, dubai', 'dubai city',
  'n/a', 'na', 'none', '-', '.', 'tbd', 'address', 'no address',
]);
function isGeneric(addr) {
  const a = String(addr || '').toLowerCase().replace(/[.,]+$/g, '').replace(/\s+/g, ' ').trim();
  if (!a || a.length < 6) return true;
  if (GENERIC.has(a)) return true;
  if (/^p\.?\s*o\.?\s*box[\s\d]*$/i.test(a)) return true;   // a PO box is not a place
  if (/^dubai[\s,\-]*(uae|u\.a\.e\.?|united arab emirates)?$/i.test(a)) return true;
  return false;
}

// ---------------------------------------------------------------- stage -> layer
const stageLayer = new Map();
for (const s of stageMap.stages) stageLayer.set(s.pipeline + '|' + s.stage_id, s.layer);
const layerOfDeal = d => stageLayer.get(d.pipeline_id + '|' + d.stage_id) || 'unclassified';

// ---------------------------------------------------------------- company layer
const LAYER_RANK = { closed_won: 4, in_process: 3, closed_lost: 2, crm: 1 };
const dealsByCompany = new Map();
for (const d of deals) {
  if (!d.company_id) continue;
  if (!dealsByCompany.has(d.company_id)) dealsByCompany.set(d.company_id, []);
  dealsByCompany.get(d.company_id).push(d);
}

const num = v => {
  const n = Number(String(v || '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};

function companyDeal(c) {
  const ds = dealsByCompany.get(c.hs_object_id) || [];
  let best = 'crm', pick = null;
  for (const d of ds) {
    const l = layerOfDeal(d);
    const mapped = l === 'won' ? 'closed_won'
      : l === 'open' ? 'in_process'
      : (l === 'lost_sales' || l === 'lost_risk') ? 'closed_lost' : null;
    if (!mapped) continue;
    if (LAYER_RANK[mapped] > LAYER_RANK[best]) { best = mapped; pick = { d, l }; }
    else if (pick && mapped === best && (num(d.amount) || 0) > (num(pick.d.amount) || 0)) pick = { d, l };
  }
  if (best === 'crm' && c.lifecyclestage === 'customer') {
    return { layer: 'closed_won', stage: 'Customer (lifecycle stage)', amount: null,
             owner: ownerName[String(c.hubspot_owner_id)] || null, lostType: null, reason: null,
             closedate: null, dealCount: ds.length, viaLifecycle: true };
  }
  if (!pick) {
    return { layer: best, stage: null, amount: null,
             owner: ownerName[String(c.hubspot_owner_id)] || null, lostType: null, reason: null,
             closedate: null, dealCount: ds.length, viaLifecycle: false };
  }
  const d = pick.d;
  return {
    layer: best,
    stage: d.stage_label || null,
    amount: num(d.amount),
    owner: ownerName[String(d.owner_id)] || ownerName[String(c.hubspot_owner_id)] || null,
    lostType: best === 'closed_lost' ? (pick.l === 'lost_risk' ? 'risk_rejected' : 'sales_lost') : null,
    reason: d.risk_rejected_reason || d.closed_lost_reason || d.pre_nop_rejection_reason || null,
    closedate: d.closedate && d.closedate !== 'Unassigned' ? d.closedate : null,
    dealCount: ds.length,
    viaLifecycle: false,
  };
}

const categoryOf = c => (!c.industry ? 'blank' : (imap.map[c.industry] || 'other'));

// ---------------------------------------------------------------- build
const out = { companies: [], universe: [], areas: comms.communities, stats: {} };
const tally = {
  total: companies.length, byLayer: {}, byCategory: {},
  byLocation: { geocoded: 0, community: 0, unlocated: 0 },
  genericAddressesRefused: 0, locatedByLayer: {}, byCommunity: {},
  adminMatched: 0, adminFunded: 0,
  wonAmount: 0, pipelineAmount: 0, lostAmount: 0,
};

for (const c of companies) {
  const info = companyDeal(c);
  const am = adminMatch[c.hs_object_id];
  // The admin app is the source of truth for who is a real, funded client. A
  // company it marks REFINANCING has been funded at least once, whatever
  // HubSpot's deal stage says.
  if (am && am.fin === 'REFINANCING' && info.layer !== 'closed_won') { info.layer = 'closed_won'; info.stage = 'Funded (admin app)'; }
  const cat = categoryOf(c);
  if (am) tally.adminMatched++;
  if (am && am.fin === 'REFINANCING') tally.adminFunded++;
  tally.byLayer[info.layer] = (tally.byLayer[info.layer] || 0) + 1;
  tally.byCategory[cat] = (tally.byCategory[cat] || 0) + 1;
  if (info.amount) {
    if (info.layer === 'closed_won') tally.wonAmount += info.amount;
    else if (info.layer === 'in_process') tally.pipelineAmount += info.amount;
    else if (info.layer === 'closed_lost') tally.lostAmount += info.amount;
  }

  let lat = null, lng = null, how = 'unlocated', community = null;
  const addrOk = c.address && !isGeneric(c.address);
  if (c.address && !addrOk) tally.genericAddressesRefused++;

  const g = addrOk ? geocoded[c.address.trim().toLowerCase()] : null;
  const m = locate({ name: c.name, address: c.address, zip: c.zip });
  if (g && g.lat != null) {
    lat = g.lat; lng = g.lng; how = 'geocoded';
    community = m ? m.community : null;
  } else if (m && comms.communities[m.community]) {
    community = m.community;
    lat = comms.communities[m.community].lat;
    lng = comms.communities[m.community].lng;
    how = 'community';
  }

  tally.byLocation[how]++;
  if (how !== 'unlocated') {
    tally.locatedByLayer[info.layer] = (tally.locatedByLayer[info.layer] || 0) + 1;
    if (community) tally.byCommunity[community] = (tally.byCommunity[community] || 0) + 1;
  }

  out.companies.push({
    i: c.hs_object_id,
    n: c.name || '(no name)',
    c: cat, l: info.layer,
    y: lat == null ? null : Number(lat.toFixed(5)),
    x: lng == null ? null : Number(lng.toFixed(5)),
    h: how, a: community,
    s: info.stage, m: info.amount, o: info.owner,
    t: info.lostType, r: info.reason, cd: info.closedate,
    d: info.dealCount, lc: info.viaLifecycle ? 1 : 0,
    ad: am ? 1 : 0, af: am && am.fin === 'REFINANCING' ? 1 : 0,
    ai: am && am.industry && am.industry.length ? am.industry[0] : null,
  });
}

const uniSummary = read('data/universe-dubai.json');
for (const [key, meta] of Object.entries(uniSummary.categories)) {
  if (!meta.file) continue;
  for (const p of read('data/' + meta.file).places) out.universe.push({ n: p.n, y: p.y, x: p.x, c: key, k: p.k });
}

out.stats = {
  pulled: '2026-09-19',
  crm: tally,
  deals: { total: deals.length, byLayer: deals.reduce((m, d) => { const l = layerOfDeal(d); m[l] = (m[l] || 0) + 1; return m; }, {}) },
  universe: { total: out.universe.length, byCategory: uniSummary.categories },
  categories: imap._buckets,
  targetCategories: imap._target_categories,
};

fs.writeFileSync(path.join(ROOT, 'data', 'map.json'), JSON.stringify(out));

const located = tally.byLocation.geocoded + tally.byLocation.community;
console.log('companies             ' + tally.total);
console.log('  geocoded            ' + tally.byLocation.geocoded);
console.log('  on a community      ' + tally.byLocation.community);
console.log('  unlocated           ' + tally.byLocation.unlocated);
console.log('  PINNED              ' + located + '  (' + (100 * located / tally.total).toFixed(1) + '%)');
console.log('  generic addr refused ' + tally.genericAddressesRefused);
console.log('');
console.log('by layer (all / pinned):');
for (const k of ['closed_won', 'in_process', 'closed_lost', 'crm'])
  console.log('  ' + k.padEnd(14) + String(tally.byLayer[k] || 0).padStart(6) + ' /' + String(tally.locatedByLayer[k] || 0).padStart(6));
console.log('');
console.log('AED won ' + tally.wonAmount.toLocaleString('en-US') +
  '  pipeline ' + tally.pipelineAmount.toLocaleString('en-US') +
  '  lost ' + tally.lostAmount.toLocaleString('en-US'));
console.log('named owners resolved: ' + Object.keys(ownerName).length);
console.log('universe places: ' + out.universe.length);
console.log('wrote data/map.json  ' + (fs.statSync(path.join(ROOT, 'data', 'map.json')).size / 1024 / 1024).toFixed(1) + ' MB');
