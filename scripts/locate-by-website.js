'use strict';
// Locate a company by reading the address IT PUBLISHES ON ITS OWN WEBSITE.
//
// Why this route, and why it is the honest version of "just google them":
//   4,170 companies are either unplaceable or stuck at emirate level, and every
//   one of them has a website on file. A UAE business almost always prints its
//   own address in the footer or on a contact page. That is the company's own
//   public statement about where it is - better evidence than anything inferred.
//
// What this does NOT do, deliberately:
//   - It does not scrape Google, or any search engine. That breaches their
//     terms, and it hits CAPTCHAs, which are never to be worked around.
//   - It uses no paid API. No Places, no Clay, no Apollo, no Lusha.
//   - It does not follow links off the company's own domain.
//
// Politeness: a descriptive User-Agent with a contact address, one request at a
// time per host, a hard timeout, at most 4 pages per company, and a small
// concurrency across DIFFERENT hosts. robots.txt is fetched once per host and
// obeyed for the paths we try.
//
// The output is a PLACE NAME, not a coordinate. It feeds the same gazetteer and
// the same precedence as every other route, so a website can lift a company
// from "somewhere in Dubai" to "Al Quoz" - it never invents a point.
//
//   node scripts/locate-by-website.js [--limit N]

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'raw/website-locations.json');
// Write-ahead records, so a crash never loses work and never repeats itself.
// Node itself dies on some hosts (an assertion inside undici's HTTP parser when
// a TLS socket ends mid-response) and that cannot be caught. Before this, the
// restart retried the same host, crashed again, and 60 restarts gained 20
// records - measured 20 Sep 2026.
const INFLIGHT = path.join(ROOT, 'raw/website-inflight.log');    // host, written BEFORE its fetch
const RESULTS = path.join(ROOT, 'raw/website-results.jsonl');    // host + result, written AFTER
const SUSPECTS = path.join(ROOT, 'raw/website-suspects.json');   // host -> crashes it was in flight for
const NL = String.fromCharCode(10);
const UA = 'FlapKap-Coverage-Map/1.0 (RevOps internal; mohamed.saeed@flapkap.com)';

const PLACES = JSON.parse(fs.readFileSync(path.join(ROOT, 'lookups/uae-places.json'), 'utf8'));
const allocated = JSON.parse(fs.readFileSync(path.join(ROOT, 'raw/allocated.json'), 'utf8'));
const geo = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'raw/uae-address-geocodes.json'), 'utf8')); } catch (e) { return {}; } })();

const norm = s => String(s || '')
  .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

// ---- needles: areas, landmarks, then emirates as the weakest fallback -------
const AREA_NEEDLES = [];
for (const [em, def] of Object.entries(PLACES.emirates)) {
  for (const a of def.areas || []) AREA_NEEDLES.push({ needle: norm(a), emirate: em, area: a });
}
for (const [n, [em, area]] of Object.entries(PLACES.landmarks || {})) {
  AREA_NEEDLES.push({ needle: norm(n), emirate: em, area });
}
try {
  const dc = JSON.parse(fs.readFileSync(path.join(ROOT, 'lookups/dubai-communities.json'), 'utf8'));
  for (const c of dc.communities || []) {
    for (const al of (c.aliases && c.aliases.length ? c.aliases : [c.name])) {
      AREA_NEEDLES.push({ needle: norm(al), emirate: 'Dubai', area: c.name });
    }
  }
} catch (e) {}
const AREAS = AREA_NEEDLES.filter(a => a.needle.length >= 5)
  .sort((a, b) => b.needle.length - a.needle.length);

const EM_NEEDLES = [];
for (const [em, def] of Object.entries(PLACES.emirates)) {
  for (const al of def.aliases) EM_NEEDLES.push({ needle: norm(al), emirate: em });
}
EM_NEEDLES.sort((a, b) => b.needle.length - a.needle.length);

// ---- who needs this ---------------------------------------------------------
const web = new Map();
for (const f of ['uae-noncity-dubai.json', 'uae-nocity-groupA.json', 'uae-nocity-groupBC.json', 'hubspot-companies.json']) {
  try {
    for (const c of JSON.parse(fs.readFileSync(path.join(ROOT, 'raw', f), 'utf8'))) {
      const w = c.website || c.domain;
      if (w && !web.has(String(c.hs_object_id))) web.set(String(c.hs_object_id), w);
    }
  } catch (e) {}
}

function needsHelp(c) {
  if (!c.emirate) return c.precision === 'uae';          // UAE, no emirate
  if (c.area) return false;                              // already has an area
  if (!c.address) return true;                           // emirate-level only
  const k = c.emirate + '|' + String(c.address).toLowerCase().replace(/\s+/g, ' ').trim();
  return !(geo[k] && geo[k].lat);                        // address did not geocode
}

// ---- fetching ---------------------------------------------------------------
const sleep = ms => new Promise(r => setTimeout(r, ms));

function hostOf(w) {
  let u = String(w).trim();
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return null; }
}

async function get(url, ms) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const res = await fetch(url, {
      redirect: 'follow', signal: ac.signal,
      headers: { 'User-Agent': UA, 'Accept': 'text/html,*/*;q=0.8', 'Accept-Language': 'en' },
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!/text|html/i.test(ct)) return null;
    const buf = await res.arrayBuffer();
    return Buffer.from(buf.slice(0, 400_000)).toString('utf8');   // cap per page
  } catch (e) { return null; } finally { clearTimeout(t); }
}

async function robotsDisallows(host) {
  const txt = await get('https://' + host + '/robots.txt', 6000);
  if (!txt) return [];
  const out = [];
  let applies = false;
  for (const line of txt.split('\n')) {
    const m = line.split('#')[0].trim();
    if (/^user-agent:/i.test(m)) applies = /:\s*\*/.test(m);
    else if (applies && /^disallow:/i.test(m)) {
      const p = m.split(':')[1].trim();
      if (p) out.push(p);
    }
  }
  return out;
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}

function findPlace(text) {
  const t = norm(text);
  if (!t) return null;
  // Must look like the UAE at all, or an area name could be a coincidence
  // ("Jumeirah" is also a hotel brand abroad).
  const uae = /united arab emirates|u a e|uae|dubai|abu dhabi|sharjah|ajman|fujairah|khaimah|quwain/.test(t);
  if (!uae) return null;
  for (const a of AREAS) if (t.includes(a.needle)) return { emirate: a.emirate, area: a.area, how: 'area' };
  const hits = new Set();
  for (const e of EM_NEEDLES) if (t.includes(e.needle)) hits.add(e.emirate);
  if (hits.size === 1) return { emirate: [...hits][0], area: null, how: 'emirate' };
  return null;
}

const PATHS = ['/', '/contact', '/contact-us', '/about'];

async function locate(host) {
  let dis = [];
  try { dis = await robotsDisallows(host); } catch (e) {}
  for (const p of PATHS) {
    if (dis.some(d => p.startsWith(d))) continue;
    const html = await get('https://' + host + p, 9000);
    await sleep(350);                                   // courtesy, same host
    if (!html) continue;
    const hit = findPlace(stripHtml(html));
    if (hit) return Object.assign({ page: p }, hit);
  }
  return null;
}

async function main() {
  let done = {};
  try { done = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) {}

  // Recover from the last run. Results logged after the last checkpoint are
  // real and are kept. Hosts started but never finished were in flight when
  // the process died - one of them killed it. They are retried once, one at a
  // time so a second crash names exactly one host; a host in flight at TWO
  // crashes is written off and never fetched again.
  const lines = file => { try { return fs.readFileSync(file, 'utf8').split(NL).filter(Boolean); } catch (e) { return []; } };
  for (const l of lines(RESULTS)) { try { const { h, r } = JSON.parse(l); if (done[h] === undefined) done[h] = r; } catch (e) {} }
  let suspects = {}; try { suspects = JSON.parse(fs.readFileSync(SUSPECTS, 'utf8')); } catch (e) {}
  const retryFirst = [];
  for (const h of new Set(lines(INFLIGHT))) {
    if (done[h] !== undefined) continue;
    suspects[h] = (suspects[h] || 0) + 1;
    if (suspects[h] >= 2) done[h] = { none: true, crash: true };
    else retryFirst.push(h);
  }
  fs.writeFileSync(OUT, JSON.stringify(done));
  fs.writeFileSync(SUSPECTS, JSON.stringify(suspects));
  fs.writeFileSync(INFLIGHT, ''); fs.writeFileSync(RESULTS, '');
  const writtenOff = Object.values(suspects).filter(n => n >= 2).length;
  if (retryFirst.length || writtenOff) console.log('recovery: retrying ' + retryFirst.length + ' host(s) one at a time; ' + writtenOff + ' written off as crashers');

  const limitArg = process.argv.indexOf('--limit');
  const LIMIT = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;

  // PRIORITY ORDER. This sweep is ~23,000 hosts and several hours, so it is
  // ordered by how much each answer is worth, in case it is stopped early:
  //
  //   1  no emirate at all        - a hit turns a company that is NOT DRAWN
  //                                 into one that is. Biggest gain per fetch.
  //   2  address failed, no area  - stuck at emirate level despite having an
  //                                 address we could not resolve.
  //   3  emirate-level only       - a hit upgrades "somewhere in Dubai" to a
  //                                 real neighbourhood. Most numerous, least
  //                                 valuable per record.
  function priority(c) {
    if (!c.emirate) return 0;
    if (c.address) return 1;
    return 2;
  }

  const seen = new Set();
  let targets = [];

  // Priority -1: the 8,040 companies that carry NO location field at all.
  // These are not in `allocated` because no sweep could reach them - nothing on
  // the record said where they were. 7,448 of them do have a domain, which is
  // the only route left, and a hit here turns a company that is nowhere on the
  // map into one that is. So they go first, ahead of everything else.
  try {
    for (const c of JSON.parse(fs.readFileSync(path.join(ROOT, 'raw/unlocated-recovered.json'), 'utf8'))) {
      if (!c.domain) continue;
      const h = hostOf(c.domain);
      if (!h || done[h] !== undefined || seen.has(h)) continue;
      seen.add(h);
      targets.push({ host: h, id: c.id, p: -1 });
    }
  } catch (e) { /* not built yet */ }

  for (const c of allocated) {
    if (!needsHelp(c)) continue;
    const w = web.get(String(c.id));
    if (!w) continue;
    const h = hostOf(w);
    if (!h || done[h] !== undefined || seen.has(h)) continue;
    seen.add(h);
    targets.push({ host: h, id: c.id, p: priority(c) });
  }
  targets.sort((a, b) => a.p - b.p);
  const byP = targets.reduce((m, t) => (m[t.p] = (m[t.p] || 0) + 1, m), {});
  if (LIMIT !== Infinity) targets = targets.slice(0, LIMIT);

  console.log('companies needing help with a website : ' + targets.length);
  console.log('already fetched                       : ' + Object.keys(done).length);
  console.log('  priority 0 (not drawn at all)       : ' + (byP[0] || 0));
  console.log('  priority 1 (address did not resolve): ' + (byP[1] || 0));
  console.log('  priority 2 (emirate-level upgrade)  : ' + (byP[2] || 0));
  console.log('');

  // 16 concurrent, across DIFFERENT hosts. The per-host courtesy delay and the
  // one-request-at-a-time-per-host rule are untouched, so no single server sees
  // more load - this only widens how many distinct servers are in flight.
  const CONC = 16;
  let i = 0, ok = 0, none = 0;
  async function fetchOne(host) {
    fs.appendFileSync(INFLIGHT, host + NL);              // before: if we die, this names the suspect
    let r = null;
    try { r = await locate(host); } catch (e) {}
    done[host] = r || { none: true };
    fs.appendFileSync(RESULTS, JSON.stringify({ h: host, r: done[host] }) + NL);   // after: never lost
    if (r) ok++; else none++;
  }
  // Suspects from the last crash go first, alone, so a second crash names exactly one host.
  for (const h of retryFirst) await fetchOne(h);
  targets = targets.filter(t => done[t.host] === undefined);
  async function worker() {
    while (i < targets.length) {
      const t = targets[i++];
      await fetchOne(t.host);
      const n = ok + none;
      if (n % 20 === 0) {
        fs.writeFileSync(OUT, JSON.stringify(done));
        console.log(n + '/' + targets.length + '  located=' + ok + '  nothing=' + none);
      }
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  fs.writeFileSync(OUT, JSON.stringify(done));
  console.log('');
  console.log('DONE  located=' + ok + '  nothing=' + none);
}

main();
