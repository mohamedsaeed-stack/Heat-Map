'use strict';
// Recover a location for the CRM companies that carry NO location field at all -
// no city, no country, no state, no address, no postcode.
//
// 8,040 companies are in that state: 17% of the portal, sitting in the dark. They
// are not counted as UAE (nothing says they are) and not counted as foreign
// either. But 93% of them have a DOMAIN and 20% have a PHONE, and both of those
// carry location that nobody had read.
//
// TWO SIGNALS, neither of which needs a single extra API call:
//
//   1. THE PHONE AREA CODE. UAE landline codes are emirate-specific, so a number
//      beginning +9714 is Dubai and +9712 is Abu Dhabi. This is the strongest
//      signal available for these records - it names an emirate outright.
//      +9716 is deliberately NOT resolved: Sharjah, Ajman and Umm Al Quwain
//      share it, so it proves the UAE and refuses to guess between the three.
//      A +9715 mobile proves the UAE and nothing more - people keep their
//      number when they move.
//
//   2. THE DOMAIN. A .ae TLD proves the UAE but never an emirate. The domain is
//      also the input to scripts/locate-by-website.js, which reads the address a
//      company publishes on its own site and is the only route here that can
//      reach an AREA.
//
// PRIVACY: the phone number is used to derive an emirate and is then DISCARDED.
// No phone number is written to raw/, to data/, or to the page - that rule is in
// README.md and it holds here. Only the derived emirate survives.
//
//   node scripts/recover-unlocated.js <spill-dir> [--out raw/unlocated-recovered.json]

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// ---- UAE landline area codes, after the +971 country code -------------------
const AREA = {
  '2': 'Abu Dhabi',
  '3': 'Abu Dhabi',        // Al Ain, which is inside the Abu Dhabi emirate
  '4': 'Dubai',
  '7': 'Ras Al Khaimah',
  '9': 'Fujairah',
  // '6' is Sharjah + Ajman + Umm Al Quwain -> UAE only, refuse to pick one
  // '5' is mobile           -> UAE only, a mobile says nothing about where
};
const AMBIGUOUS = new Set(['5', '6']);

function fromPhone(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (!d) return null;
  let rest = null;
  if (d.startsWith('00971')) rest = d.slice(5);
  else if (d.startsWith('971')) rest = d.slice(3);
  else if (d.startsWith('0') && d.length >= 9 && d.length <= 10) rest = d.slice(1);
  else return null;                       // not a UAE number we can read
  if (!rest) return null;
  const a = rest[0];
  if (AMBIGUOUS.has(a)) return { uae: true, emirate: null, why: 'phone +971' + a + ' (shared code)' };
  if (AREA[a]) return { uae: true, emirate: AREA[a], why: 'phone +971' + a };
  return { uae: true, emirate: null, why: 'phone +971' };
}

function fromDomain(dom, web) {
  const s = String(dom || web || '').toLowerCase();
  if (!s) return null;
  if (/\.ae(\/|$|\?)/.test(s) || s.endsWith('.ae')) return { uae: true, emirate: null, why: 'domain .ae' };
  return null;
}

// ---- read the spilled pages -------------------------------------------------
function recordsFrom(file) {
  let j;
  try { j = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return []; }
  if (!j || !Array.isArray(j.results)) return [];
  const out = [];
  for (const r of j.results) {
    if (typeof r.content !== 'string') continue;
    let rec;
    try { rec = JSON.parse(r.content); } catch (e) { continue; }
    if (rec && rec.properties) out.push(rec.properties);
  }
  return out;
}

function main() {
  const dir = process.argv[2];
  const outIdx = process.argv.indexOf('--out');
  const out = outIdx > -1 ? process.argv[outIdx + 1] : 'raw/unlocated-recovered.json';

  const files = fs.readdirSync(dir).filter(f => f.includes('query_crm_data'))
    .map(f => path.join(dir, f));

  const byId = new Map();
  for (const f of files) for (const p of recordsFrom(f)) {
    if (p.hs_object_id) byId.set(String(p.hs_object_id), p);
  }

  const recovered = [];
  const tally = { phoneEmirate: 0, phoneUAE: 0, domainUAE: 0, nothing: 0, hasDomain: 0 };
  const byEmirate = {};

  for (const [id, p] of byId) {
    const ph = fromPhone(p.phone);
    const dm = fromDomain(p.domain, p.website);
    const domain = p.domain || p.website || null;
    if (domain) tally.hasDomain++;

    let emirate = null, uae = false, why = null;
    if (ph && ph.emirate) { emirate = ph.emirate; uae = true; why = ph.why; tally.phoneEmirate++; }
    else if (ph) { uae = true; why = ph.why; tally.phoneUAE++; }
    else if (dm) { uae = true; why = dm.why; tally.domainUAE++; }
    else tally.nothing++;

    if (emirate) byEmirate[emirate] = (byEmirate[emirate] || 0) + 1;

    recovered.push({
      id, name: p.name || null,
      domain,                                  // kept - it is the website-sweep input
      industry: p.industry || null,
      lifecyclestage: p.lifecyclestage || null,
      uae, emirate, why,                       // PHONE ITSELF IS NOT KEPT
    });
  }

  fs.mkdirSync(path.dirname(path.join(ROOT, out)), { recursive: true });
  fs.writeFileSync(path.join(ROOT, out), JSON.stringify(recovered));

  const num = n => Number(n).toLocaleString().padStart(8);
  console.log('pages parsed            ' + files.length);
  console.log('distinct companies      ' + num(byId.size));
  console.log('  with a domain         ' + num(tally.hasDomain));
  console.log('');
  console.log('RECOVERED');
  console.log('  emirate, from phone   ' + num(tally.phoneEmirate));
  console.log('  UAE only, from phone  ' + num(tally.phoneUAE));
  console.log('  UAE only, from .ae    ' + num(tally.domainUAE));
  console.log('  still nothing         ' + num(tally.nothing));
  console.log('  TOTAL now known UAE   ' + num(tally.phoneEmirate + tally.phoneUAE + tally.domainUAE));
  console.log('');
  console.log('BY EMIRATE (from phone area code)');
  for (const [k, v] of Object.entries(byEmirate).sort((a, b) => b[1] - a[1])) {
    console.log('  ' + k.padEnd(20) + num(v));
  }
  console.log('');
  console.log('wrote ' + out);
}

main();
