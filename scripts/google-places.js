'use strict';
// Place companies from Google Places (all branches of a brand, head office flagged).
//
// WHY. HubSpot addresses are thin and the geocoder guesses; Google Places knows where a
// brand actually trades, including every branch. This script asks Places API (New)
// "Text Search" for each company and keeps the results that really are that brand.
//
// USAGE
//   GOOGLE_PLACES_KEY=... node scripts/google-places.js --scope funded
//   node scripts/google-places.js --scope coloured --limit 200
//   node scripts/google-places.js --scope ids=8257081316,8950503871
//   node scripts/google-places.js --scope funded --limit 5 --dry-run     (no key, no network)
//   options: --out raw/places-results.jsonl   (default; overrides go next to it as places-overrides.json)
//
//   --scope funded    companies with a funded record (fi) in data/map-uae.json
//   --scope coloured  layer closed_won / in_process / closed_lost
//   --scope ids=..    those companies by id (comma separated)
//   --limit N         first N companies of the scope
//   --dry-run         print the queries and how many are already cached; calls nothing, writes nothing
//
// GETTING A KEY
//   Google Cloud console -> create/select a project (billing on) -> APIs & Services ->
//   enable "Places API (New)" -> Credentials -> Create credentials -> API key -> restrict
//   the key to "Places API (New)" only. The key is read ONLY from the environment variable
//   GOOGLE_PLACES_KEY; it is never written to a file, the cache or the log.
//
// WHAT IT CALLS
//   POST https://places.googleapis.com/v1/places:searchText
//   X-Goog-FieldMask: places.id,places.displayName,places.formattedAddress,places.location,
//                     places.types,places.businessStatus
//   body { textQuery: "<cleaned name> <emirate or UAE>", regionCode:"AE", languageCode:"en", pageSize:20 }
//   Max 5 requests per second; 429 and 5xx are retried 3 times with growing back-off.
//   Every raw response is cached in raw/places-cache.json keyed by the query text, so a re-run
//   costs nothing for queries already asked. Delete a key from the cache to ask again.
//
// COST (estimate printed at the end)
//   $32 per 1,000 Text Search (Pro) requests, the first 5,000 requests a month free.
//   Only queries that were NOT in the cache count.
//
// OUTPUT (the existing raw/gmaps-overrides.json and the build are never touched)
//   raw/places-results.jsonl   one line per company: query, branches, rejected (and why), hq placeId
//   raw/places-overrides.json  { "<hubspot id>": { lat, lon, address, emirate, area, placement:'exact',
//                                route:'Google Places', hq:true|false, branches:[{name,lat,lon,address,emirate,area,hq}] } }
//     Top-level lat/lon is the head office, or the best-matching branch when the head office is unknown
//     (hq:false). y, x, e, a, ga repeat the same values under the keys build-map-data-uae.js reads
//     from raw/gmaps-overrides.json today, so this file can be fed to the build as it is.
//     Admin-only companies (id "admin:...") have no HubSpot id; they are written under that id.

const fs = require('fs');
const path = require('path');
const M = require('./lib/places-match');

const ROOT = path.join(__dirname, '..');
const CACHE_FILE = path.join(ROOT, 'raw', 'places-cache.json');
const API_URL = 'https://places.googleapis.com/v1/places:searchText';
const FIELD_MASK = 'places.id,places.displayName,places.formattedAddress,places.location,places.types,places.businessStatus';
const MIN_GAP_MS = 200;                 // 5 requests per second
const PRICE_PER_1000 = 32, FREE_PER_MONTH = 5000;

// ---- arguments ---------------------------------------------------------------
function parseArgs(argv) {
  const o = { scope: null, limit: Infinity, dry: false, out: path.join('raw', 'places-results.jsonl') };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') o.dry = true;
    else if (a === '--scope') o.scope = argv[++i];
    else if (a.startsWith('--scope=')) o.scope = a.slice(8);
    else if (a === '--limit') o.limit = +argv[++i];
    else if (a.startsWith('--limit=')) o.limit = +a.slice(8);
    else if (a === '--out') o.out = argv[++i];
    else if (a.startsWith('--out=')) o.out = a.slice(6);
    else { console.error('Unknown argument: ' + a); process.exit(2); }
  }
  if (!o.scope || !(o.scope === 'funded' || o.scope === 'coloured' || /^ids=.+/.test(o.scope))) {
    console.error('Usage: node scripts/google-places.js --scope funded|coloured|ids=1,2,3 [--limit N] [--dry-run] [--out raw/places-results.jsonl]');
    process.exit(2);
  }
  if (!(o.limit > 0)) o.limit = Infinity;
  return o;
}

const readJson = (f, dflt) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return dflt; } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function selectCompanies(all, scope, limit) {
  let list;
  if (scope === 'funded') list = all.filter(c => c.fi);
  else if (scope === 'coloured') list = all.filter(c => c.l === 'closed_won' || c.l === 'in_process' || c.l === 'closed_lost');
  else {
    const want = scope.slice(4).split(',').map(s => s.trim()).filter(Boolean);
    const byId = new Map(all.map(c => [String(c.i), c]));
    list = [];
    for (const id of want) { const c = byId.get(id); if (c) list.push(c); else console.warn('  id not in data/map-uae.json: ' + id); }
  }
  return list.slice(0, limit);
}

const queryFor = c => (M.cleanName(c.n) + ' ' + (c.e || 'UAE')).replace(/\s+/g, ' ').trim();

// ---- cache -------------------------------------------------------------------
function saveCache(cache) {
  const tmp = CACHE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache));
  fs.renameSync(tmp, CACHE_FILE);
}

// ---- Places call, rate limited, retried ----------------------------------------
let lastCall = 0;
async function searchText(query, key) {
  const body = JSON.stringify({ textQuery: query, regionCode: 'AE', languageCode: 'en', pageSize: 20 });
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const wait = lastCall + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': FIELD_MASK },
        body,
      });
      if (res.ok) return await res.json();
      const text = await res.text();
      lastErr = new Error('HTTP ' + res.status + ' ' + text.slice(0, 200));
      if (res.status !== 429 && res.status < 500) throw Object.assign(lastErr, { fatal: true });   // 400/403: retrying will not help
    } catch (e) {
      if (e.fatal) throw e;
      lastErr = e;
    }
    if (attempt < 3) await sleep(1000 * 2 ** (attempt - 1));   // 1 s, then 2 s
  }
  throw lastErr;
}

// ---- main --------------------------------------------------------------------
async function main() {
  const opt = parseArgs(process.argv.slice(2));
  const data = readJson(path.join(ROOT, 'data', 'map-uae.json'), null);
  if (!data) { console.error('data/map-uae.json not found'); process.exit(1); }
  const companies = selectCompanies(data.companies, opt.scope, opt.limit);
  const cache = readJson(CACHE_FILE, {});
  const jobs = companies.map(c => ({ c, q: queryFor(c) }));
  const uniq = [...new Set(jobs.map(j => j.q))];
  const todo = uniq.filter(q => !(q in cache));

  console.log(`Scope ${opt.scope}: ${companies.length} companies, ${uniq.length} distinct queries, ${uniq.length - todo.length} cached, ${todo.length} to ask.`);

  const cost = n => {
    const billable = Math.max(0, n - FREE_PER_MONTH);
    return `${n} requests: $${(n * PRICE_PER_1000 / 1000).toFixed(2)} before the free quota, $${(billable * PRICE_PER_1000 / 1000).toFixed(2)} after ${FREE_PER_MONTH} free a month (assuming none used yet this month)`;
  };

  if (opt.dry) {
    const show = jobs.slice(0, 50);
    for (const j of show) console.log(`  ${(j.q in cache) ? 'cached ' : 'to-ask '} ${j.c.i}  "${j.q}"`);
    if (jobs.length > show.length) console.log(`  ... and ${jobs.length - show.length} more`);
    console.log('Dry run: nothing called, nothing written. Estimated cost of the uncached: ' + cost(todo.length));
    return;
  }

  const key = process.env.GOOGLE_PLACES_KEY;
  if (todo.length && !key) {
    console.error(`GOOGLE_PLACES_KEY is not set and ${todo.length} queries are not cached. Set it (see the header of this file), or use --dry-run.`);
    process.exit(1);
  }

  // ask Google for what the cache lacks
  let asked = 0, failed = 0, sinceSave = 0;
  const flush = () => { try { saveCache(cache); } catch (e) { console.error('cache save failed: ' + e.message); } };
  process.on('SIGINT', () => { flush(); console.error('\nInterrupted; cache saved.'); process.exit(130); });
  for (const q of todo) {
    try {
      const r = await searchText(q, key);
      cache[q] = { places: Array.isArray(r.places) ? r.places : [], at: new Date().toISOString() };
      asked++; sinceSave++;
    } catch (e) {
      failed++;
      console.error(`  failed "${q}": ${e.message}`);
      if (e.fatal) { flush(); console.error('Stopping: the API refused the request (check the key, the API restriction and billing).'); process.exit(1); }
    }
    if (sinceSave >= 10) { flush(); sinceSave = 0; }
    if (asked && asked % 50 === 0) console.log(`  ${asked}/${todo.length} asked`);
  }
  if (sinceSave) flush();

  // match, pick HQ, write
  const outFile = path.resolve(ROOT, opt.out);
  const overridesFile = path.join(path.dirname(outFile), 'places-overrides.json');
  const lines = [], overrides = {};
  let multi = 0, one = 0, none = 0, hqKnown = 0, unanswered = 0;
  for (const { c, q } of jobs) {
    const hit = cache[q];
    if (!hit) { unanswered++; continue; }   // request failed this run: leave it out, a re-run asks again
    const { branches, rejected, reason } = M.acceptBranches(c, hit.places);
    const hq = M.pickHq(c, branches);
    if (branches.length >= 2) multi++; else if (branches.length === 1) one++; else none++;
    if (hq) hqKnown++;
    lines.push(JSON.stringify({
      id: c.i, name: c.n, emirate: c.e || null, query: q, reason,
      hq: hq ? hq.placeId : null, hqNote: branches.length ? (hq ? 'HQ by address' + (branches.length === 1 ? ' (only branch)' : '') : 'HQ unknown') : null,
      branches, rejected,
    }));
    if (!branches.length) continue;
    const first = hq || branches[0];
    const mk = b => { const d = M.deriveEmirateArea(b.address, b.lat, b.lng); return { name: b.name, lat: b.lat, lon: b.lng, address: b.address, emirate: d.emirate || c.e || null, area: d.area, hq: !!hq && b.placeId === hq.placeId }; };
    const top = mk(first);
    overrides[String(c.i)] = {
      lat: top.lat, lon: top.lon, address: top.address, emirate: top.emirate, area: top.area,
      placement: 'exact', route: 'Google Places', hq: !!hq,
      y: top.lat, x: top.lon, e: top.emirate, a: top.area, ga: top.address + ' (Google Places: ' + top.name + ')',
      branches: branches.map(mk),
    };
  }
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, lines.join('\n') + (lines.length ? '\n' : ''));
  fs.writeFileSync(overridesFile, JSON.stringify(overrides, null, 1));

  console.log('\nSummary');
  console.log(`  processed:            ${lines.length} of ${companies.length}${unanswered ? ` (${unanswered} unanswered, re-run to retry)` : ''}`);
  console.log(`  with 2+ branches:     ${multi}`);
  console.log(`  with 1 branch:        ${one}`);
  console.log(`  with 0 branches:      ${none}`);
  console.log(`  head office flagged:  ${hqKnown} (the rest: HQ unknown)`);
  console.log(`  API requests made:    ${cost(asked)}${failed ? `; ${failed} failed` : ''}`);
  console.log(`  wrote ${path.relative(ROOT, outFile)} and ${path.relative(ROOT, overridesFile)}`);
}

main().catch(e => { console.error(e.stack || e.message); process.exit(1); });
