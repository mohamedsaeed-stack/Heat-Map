'use strict';
// Build data/meta.json - every headline figure the page shows, computed from the
// committed lookups rather than typed in by hand.
//
// Computing the bucket totals here instead of copying them out of a comment also
// checks industry-map.json: if an industry value in the counts file is missing
// from the map, this script says so instead of quietly dropping the companies.
//
//   node scripts/build-meta.js

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const L = f => path.join(ROOT, 'lookups', f);

function tsv(file) {
  return fs.readFileSync(L(file), 'utf8')
    .split(/\r?\n/)
    .filter(l => l.trim() && !l.startsWith('#'))
    .map(l => l.split('\t'));
}

const problems = [];

// ---- the Dubai universe -----------------------------------------------------
const cityRows = tsv('dubai-city-variants.tsv').slice(1);
let dubaiTotal = 0;
const excluded = [];
for (const [city, n, yes, note] of cityRows) {
  if (yes === 'yes') dubaiTotal += Number(n);
  else excluded.push({ city, companies: Number(n), why: note || '' });
}

// ---- lifecycle --------------------------------------------------------------
const lifecycle = tsv('dubai-lifecycle-counts.tsv').slice(1)
  .map(([label, value, n]) => ({ label, value, companies: Number(n) }));
const lifecycleSum = lifecycle.reduce((s, r) => s + r.companies, 0);

// Reconciliation, worked out 19 Sep 2026 and worth keeping written down.
// The city-variant table's "yes" rows sum to 19,973. The lifecycle and industry
// queries both sum to 19,974. The difference is exactly the one company whose
// city reads "abu dhabi / dubai": those two queries filtered on
// city LIKE '%dubai%' and so included it, while the variant table marks it
// excluded. So 19,974 is the raw LIKE match and 19,973 is Dubai proper.
// The lookup file's own comment calls 19,974 the "yes rows" total; that is the
// one number in it that does not hold up.
const AMBIGUOUS = excluded.filter(e => /abu dhabi/i.test(e.city))
                          .reduce((s, e) => s + e.companies, 0);
const rawLikeMatch = dubaiTotal + AMBIGUOUS;
if (lifecycleSum !== rawLikeMatch) problems.push('lifecycle sums to ' + lifecycleSum + ', expected ' + rawLikeMatch);

// ---- categories, computed from the raw industry counts ----------------------
const imap = JSON.parse(fs.readFileSync(L('industry-map.json'), 'utf8'));
const bucketOf = v => (v === '(null)' ? 'blank' : (imap.map[v] || null));

function bucketTotals(rows, countCol) {
  const out = {};
  for (const r of rows) {
    const value = r[1];
    const n = Number(r[countCol]);
    const b = bucketOf(value);
    if (!b) { problems.push('industry value not in industry-map.json: ' + value); continue; }
    out[b] = (out[b] || 0) + n;
  }
  return out;
}

const companiesByBucket = bucketTotals(tsv('dubai-industry-counts.tsv').slice(1), 2);
const customersByBucket = bucketTotals(tsv('dubai-customer-industry-counts.tsv').slice(1), 2);

const companiesSum = Object.values(companiesByBucket).reduce((a, b) => a + b, 0);
if (companiesSum !== rawLikeMatch) problems.push('industry buckets sum to ' + companiesSum + ', expected ' + rawLikeMatch);
const customersSum = Object.values(customersByBucket).reduce((a, b) => a + b, 0);
const customersExpected = (lifecycle.find(r => r.value === 'customer') || {}).companies;
if (customersSum !== customersExpected) problems.push('customer buckets sum to ' + customersSum + ', expected ' + customersExpected);

const TARGET = imap._target_categories;
const categories = Object.keys(imap._buckets).map(key => ({
  key,
  label: imap._buckets[key],
  target: TARGET.includes(key),
  companies: companiesByBucket[key] || 0,
  customers: customersByBucket[key] || 0,
}));

// ---- deals ------------------------------------------------------------------
const stageMap = JSON.parse(fs.readFileSync(L('stage-map.json'), 'utf8'));
const dealsByLayer = {};
const dealsByPipeline = {};
let needConfirm = 0;
for (const s of stageMap.stages) {
  const pipe = stageMap._pipelines[s.pipeline];
  if (!pipe.in_scope) continue;
  dealsByLayer[s.layer] = (dealsByLayer[s.layer] || 0) + s.deals;
  dealsByPipeline[pipe.name] = (dealsByPipeline[pipe.name] || 0) + s.deals;
  if (s.confirm) needConfirm += s.deals;
}

// ---- communities ------------------------------------------------------------
const comms = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'communities.json'), 'utf8'));
const lookupComms = JSON.parse(fs.readFileSync(L('dubai-communities.json'), 'utf8'));
const withCentroid = Object.keys(comms.communities).length;
const noCentroid = lookupComms.communities.map(c => c.name).filter(n => !comms.communities[n]);

// ---- write ------------------------------------------------------------------
const meta = {
  _built: new Date().toISOString(),
  _problems: problems,

  snapshot: {
    crm_pulled: '2026-09-19',
    osm_pulled: '2026-09-19',
    admin_pulled: null,
  },

  universe: {
    dubai_companies: dubaiTotal,
    raw_like_match: rawLikeMatch,
    reconciliation: "city LIKE '%dubai%' returns " + rawLikeMatch + " companies. One of them has city 'abu dhabi / dubai' and is excluded as ambiguous, leaving " + dubaiTotal + ". The lifecycle and industry breakdowns below total " + rawLikeMatch + " because they were queried before that exclusion, so each is one company larger than Dubai proper.",
    definition: "HubSpot COMPANY where city LIKE '%dubai%', excluding 'abu dhabi / dubai'. 18 spellings matched '%ubai%'; two of them are Al Jubail and Jubail Industrial City in Saudi Arabia and are excluded by using '%dubai%'.",
    excluded,
    with_address: 5335,
    with_city_only: dubaiTotal - 5335,
  },

  lifecycle,
  categories,

  deals: {
    _scope: 'ALL deals in the four in-scope pipelines. NOT yet filtered to Dubai - the Dubai filter goes on the associated COMPANY.city, which needs the row-level pull.',
    by_layer: dealsByLayer,
    by_pipeline: dealsByPipeline,
    awaiting_confirmation: needConfirm,
    stage_map_status: stageMap._status,
  },

  communities: {
    defined: lookupComms.communities.length,
    with_centroid: withCentroid,
    without_centroid: noCentroid,
  },

  layers: {
    universe:    { built: false, note: 'Not pulled yet. OpenStreetMap via Overpass, free. Credible for F&B, medical, auto and retail only.' },
    crm:         { built: false, note: 'Not pulled yet. Needs the partitioned HubSpot COMPANY pull.' },
    in_process:  { built: false, note: 'Not pulled yet. Needs the DEAL pull and an approved stage map.' },
    closed_lost: { built: false, note: 'Not pulled yet. Two taxonomies kept apart: lost by sales, rejected by Risk.' },
    closed_won:  { built: false, note: 'Not pulled yet. Admin app is primary; HubSpot customer count is a cross-check.' },
  },
};

const OUT = path.join(ROOT, 'data', 'meta.json');
fs.writeFileSync(OUT, JSON.stringify(meta, null, 2) + '\n');

console.log('Dubai companies      ' + dubaiTotal);
console.log('lifecycle sum        ' + lifecycleSum);
console.log('industry bucket sum  ' + companiesSum);
console.log('customers sum        ' + customersSum + ' (expected ' + customersExpected + ')');
console.log('');
console.log('category'.padEnd(30) + 'companies'.padStart(10) + 'customers'.padStart(11) + '  target');
for (const c of categories) {
  console.log(c.label.padEnd(30) + String(c.companies).padStart(10) + String(c.customers).padStart(11) + '  ' + (c.target ? 'yes' : ''));
}
const targetSum = categories.filter(c => c.target).reduce((s, c) => s + c.companies, 0);
console.log('');
console.log('seven target categories: ' + targetSum + ' companies');
console.log('deals by layer: ' + JSON.stringify(dealsByLayer) + '  (' + needConfirm + ' deals sit in stages awaiting your confirmation)');
console.log('communities with a centroid: ' + withCentroid + ' of ' + lookupComms.communities.length);
console.log('');
if (problems.length) { console.log('PROBLEMS:'); for (const p of problems) console.log('  ! ' + p); }
else console.log('all cross-checks passed');
