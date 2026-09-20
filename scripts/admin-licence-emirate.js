'use strict';
// Give every funded admin-app client a location of its own.
//
// Pulled per client (one flapkap_get_client call each, in eight fresh agents,
// 20 Sep 2026) into raw/admin-licence-part-*.json: the licence strings, the
// legal addresses, the website hostname, the country, and the emirate derived
// from the phone area code. The phone number itself was discarded before it
// reached disk, by the rule in force since 19 Sep 2026.
//
// What the pull found, against the brief:
//   - `legalAddresses` is NOT always empty. The brief sampled three clients and
//     found it empty on all three; across the funded book it is filled on about
//     a third, and those are real street addresses naming an area ("Office No.
//     401, Al Qusais 4, Deira, Dubai, UAE"). They go to the allocator as the
//     record's address, where the area matcher reads them.
//   - The licence's issuing authority names the emirate: "636960 DET-Dubai" is
//     a Dubai company, "741566 EDD-Sharjah" a Sharjah one.
//   - 47 funded clients are Egyptian (country EGY, +20 phones). This is a UAE
//     map; they are marked foreign here and dropped by the allocator.
//
// Evidence order, per client (the allocator applies the address itself):
//   1 licence authority     -> emirate
//   2 phone area code       -> emirate
//   3 website address       -> emirate + area, from raw/website-locations.json
//   4 UAE only              when country or phone proves the country but nothing names an emirate
//
//   node scripts/admin-licence-emirate.js
//   -> raw/admin-licence-emirate.json, and a summary on stdout including every
//      authority string the table below does not recognise, so it can be extended.

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// Authority tokens -> emirate. Matched case-insensitively as whole words inside
// the licence string with the digits removed. Longest token first.
const AUTHORITY = [
  // Dubai: the department and the free zones
  ['det-dubai', 'Dubai'], ['ded-dubai', 'Dubai'], ['dubai', 'Dubai'], ['dxb', 'Dubai'],
  ['jafza', 'Dubai'], ['dmcc', 'Dubai'], ['dafza', 'Dubai'], ['dafz', 'Dubai'], ['dwc', 'Dubai'],
  ['dso', 'Dubai'], ['dsoa', 'Dubai'], ['difc', 'Dubai'], ['ifza', 'Dubai'], ['meydan', 'Dubai'],
  ['dwtc', 'Dubai'], ['dmc', 'Dubai'], ['dcc', 'Dubai'], ['dhcc', 'Dubai'], ['dubai south', 'Dubai'],
  ['tecom', 'Dubai'], ['dda', 'Dubai'], ['dip', 'Dubai'], ['dubai healthcare city', 'Dubai'],
  ['dubai internet city', 'Dubai'], ['dubai media city', 'Dubai'], ['dubai silicon oasis', 'Dubai'],
  ['jebel ali', 'Dubai'], ['dubai multi commodities', 'Dubai'], ['dubai airport', 'Dubai'],
  ['dubai world trade', 'Dubai'], ['dtec', 'Dubai'], ['dubai economy', 'Dubai'], ['ded', 'Dubai'], ['det', 'Dubai'],
  // Sharjah
  ['edd-sharjah', 'Sharjah'], ['sedd', 'Sharjah'], ['sharjah', 'Sharjah'], ['shj', 'Sharjah'],
  ['saif', 'Sharjah'], ['hamriyah', 'Sharjah'], ['hfza', 'Sharjah'], ['spc', 'Sharjah'], ['shams', 'Sharjah'],
  ['srtip', 'Sharjah'], ['sharjah media city', 'Sharjah'], ['sharjah publishing', 'Sharjah'],
  // Abu Dhabi
  ['added', 'Abu Dhabi'], ['ded-abu dhabi', 'Abu Dhabi'], ['abu dhabi', 'Abu Dhabi'], ['abudhabi', 'Abu Dhabi'],
  ['auh', 'Abu Dhabi'], ['kizad', 'Abu Dhabi'], ['kezad', 'Abu Dhabi'], ['adgm', 'Abu Dhabi'], ['masdar', 'Abu Dhabi'],
  ['twofour54', 'Abu Dhabi'], ['adafz', 'Abu Dhabi'], ['al ain', 'Abu Dhabi'], ['alain', 'Abu Dhabi'],
  ['adcci', 'Abu Dhabi'], ['dcd', 'Abu Dhabi'],
  // Ajman
  ['ajman', 'Ajman'], ['afz', 'Ajman'], ['afza', 'Ajman'], ['ajm', 'Ajman'],
  // Ras Al Khaimah
  ['ras al khaimah', 'Ras Al Khaimah'], ['rakez', 'Ras Al Khaimah'], ['rakicc', 'Ras Al Khaimah'],
  ['rak ded', 'Ras Al Khaimah'], ['rakia', 'Ras Al Khaimah'], ['rak', 'Ras Al Khaimah'],
  // Fujairah
  ['fujairah', 'Fujairah'], ['ffz', 'Fujairah'], ['ffza', 'Fujairah'], ['fcc', 'Fujairah'], ['fuj', 'Fujairah'],
  // Umm Al Quwain
  ['umm al quwain', 'Umm Al Quwain'], ['uaq', 'Umm Al Quwain'], ['uaqftz', 'Umm Al Quwain'],
].sort((a, b) => b[0].length - a[0].length);

const norm = s => String(s || '').toLowerCase().replace(/[0-9]/g, ' ').replace(/[^a-z\s-]/g, ' ').replace(/\s+/g, ' ').trim();

function emirateFromLicence(lic) {
  const t = ' ' + norm(lic).replace(/-/g, ' ') + ' ';
  const t2 = ' ' + norm(lic) + ' ';
  for (const [tok, em] of AUTHORITY) {
    const k = ' ' + tok.replace(/-/g, ' ') + ' ';
    if (t.includes(k) || t2.includes(' ' + tok + ' ')) return { emirate: em, token: tok };
  }
  return null;
}

function hostOf(w) {
  let u = String(w || '').trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return null; }
}

// ISO-3 codes the admin app uses -> the country names the allocator recognises.
const COUNTRY = { ARE: 'United Arab Emirates', EGY: 'Egypt', SAU: 'Saudi Arabia' };

function main() {
  const parts = fs.readdirSync(path.join(ROOT, 'raw')).filter(f => /^admin-licence-part-\d+\.json$/.test(f)).sort();
  const byId = new Map();
  for (const f of parts) {
    let arr = [];
    try { arr = JSON.parse(fs.readFileSync(path.join(ROOT, 'raw', f), 'utf8')); } catch (e) { console.log('unreadable ' + f + ': ' + e.message); continue; }
    for (const r of arr) if (r && r.id) byId.set(r.id, r);
  }
  const funded = JSON.parse(fs.readFileSync(path.join(ROOT, 'raw/funded-ids.json'), 'utf8'));
  // Industry, round and creation date come from the summary pull, which has them.
  const summary = new Map(JSON.parse(fs.readFileSync(path.join(ROOT, 'raw/admin-clients.json'), 'utf8')).map(c => [c.id, c]));
  let webLoc = {};
  try { webLoc = JSON.parse(fs.readFileSync(path.join(ROOT, 'raw/website-locations.json'), 'utf8')); } catch (e) {}

  const out = [];
  const tally = { emirate: {}, route: {}, unmapped: {}, country: {}, errors: 0, missing: 0, legalAddresses: 0, foreign: 0 };
  for (const fid of funded) {
    const r = byId.get(fid.id);
    if (!r) { tally.missing++; continue; }
    if (r.error) { tally.errors++; continue; }
    const addresses = Array.isArray(r.legalAddresses) ? r.legalAddresses.filter(a => typeof a === 'string' && a.trim()) : [];
    if (addresses.length) tally.legalAddresses++;
    tally.country[r.country || 'null'] = (tally.country[r.country || 'null'] || 0) + 1;

    // A client whose own record names another country is not on a UAE map.
    const foreign = !!(r.country && r.country !== 'ARE') || r.phoneUAE === false;
    if (foreign) tally.foreign++;

    let emirate = null, area = null, route = null, uae = false, authority = null;
    if (!foreign) {
      for (const lic of r.licences || []) {
        const hit = emirateFromLicence(lic);
        if (hit) { emirate = hit.emirate; authority = hit.token; route = 'licence'; break; }
        const a = norm(lic).replace(/\s+/g, ' ');
        if (a) tally.unmapped[a] = (tally.unmapped[a] || 0) + 1;
      }
      if (!emirate && r.phoneEmirate) { emirate = r.phoneEmirate; route = 'phone area code'; }
      const host = hostOf(r.website);
      const wh = host && webLoc[host] && webLoc[host].emirate ? webLoc[host] : null;
      if (!emirate && wh) { emirate = wh.emirate; area = wh.area || null; route = 'website'; }
      else if (emirate && wh && wh.emirate === emirate && wh.area) { area = wh.area; route += ' + website area'; }
      uae = !!(emirate || r.phoneUAE === true || r.country === 'ARE' || addresses.length);
      if (!emirate && uae) route = route || (r.phoneUAE ? 'phone +971' : 'admin country');
    }

    const s = summary.get(fid.id) || {};
    out.push({
      id: r.id, name: r.name || fid.name || s.name || null,
      country: COUNTRY[r.country] || r.country || null, foreign,
      emirate, area, route, uae, authority,
      // The first legal address is the registered office. It stays in raw/ only:
      // the allocator reads an area out of it and never passes the text on.
      address: addresses[0] || null, addressCount: addresses.length,
      website: hostOf(r.website),
      industry: Array.isArray(s.ind) ? s.ind : [], round: s.round || null,
      lastDisbursementDate: r.lastDisbursementDate || null,
    });
    const em = foreign ? 'foreign (' + (r.country || 'phone') + ')' : emirate || (uae ? 'UAE (emirate unknown)' : 'nothing');
    tally.emirate[em] = (tally.emirate[em] || 0) + 1;
    if (route) tally.route[route] = (tally.route[route] || 0) + 1;
  }

  fs.writeFileSync(path.join(ROOT, 'raw/admin-licence-emirate.json'), JSON.stringify(out));
  const pad = (s, n) => String(s).padEnd(n);
  const num = n => n.toLocaleString().padStart(6);
  console.log('funded clients          ' + num(funded.length));
  console.log('  pulled                ' + num(byId.size) + '   (from ' + parts.length + ' part files)');
  console.log('  missing               ' + num(tally.missing));
  console.log('  call errors           ' + num(tally.errors));
  console.log('  with legalAddresses   ' + num(tally.legalAddresses) + '   (the brief believed the field empty)');
  console.log('  foreign               ' + num(tally.foreign) + '   ' + JSON.stringify(tally.country));
  console.log('');
  console.log('BY EMIRATE (before the allocator reads the legal addresses)');
  for (const [k, v] of Object.entries(tally.emirate).sort((a, b) => b[1] - a[1])) console.log('  ' + pad(k, 24) + num(v));
  console.log('');
  console.log('BY ROUTE');
  for (const [k, v] of Object.entries(tally.route).sort((a, b) => b[1] - a[1])) console.log('  ' + pad(k, 32) + num(v));
  const un = Object.entries(tally.unmapped).sort((a, b) => b[1] - a[1]);
  if (un.length) {
    console.log('');
    console.log('AUTHORITY STRINGS NOT RECOGNISED (digits removed) - extend the table:');
    for (const [k, v] of un.slice(0, 40)) console.log('  ' + pad(k, 40) + num(v));
  }
  console.log('');
  console.log('wrote raw/admin-licence-emirate.json  ' + out.length + ' records');
}

main();
