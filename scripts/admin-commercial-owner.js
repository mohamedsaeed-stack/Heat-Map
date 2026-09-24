'use strict';
// Who closed each funded client, per the admin app: the COMMERCIAL entries of
// `assignedAdmins`, with the referral code as a fallback when there is none.
// Pulled per client into raw/admin-owner-part-*.json by fresh agents (24 Sep
// 2026, Mohamed: "only commercial" - Risk and FinOps assignees are not kept).
//
//   node scripts/admin-commercial-owner.js
//   -> raw/admin-commercial.json  { businessId: { owners: [names], referral: code|null } }

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const parts = fs.readdirSync(path.join(ROOT, 'raw')).filter(f => /^admin-owner-part-\d+\.json$/.test(f)).sort();
const out = {};
const tally = {};
let n = 0, withOwner = 0, viaReferral = 0;
for (const f of parts) {
  let arr = [];
  try { arr = JSON.parse(fs.readFileSync(path.join(ROOT, 'raw', f), 'utf8')); } catch (e) { console.log('unreadable ' + f); continue; }
  for (const r of arr) {
    if (!r || !r.id || r.error) continue;
    n++;
    let owners = Array.isArray(r.commercial) ? r.commercial.filter(Boolean) : [];
    let referral = r.referralCode || null;
    if (!owners.length && referral) {
      // "adnan.anwar" -> "Adnan Anwar"
      owners = [referral.split(/[._-]/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ')];
      viaReferral++;
    }
    if (owners.length) withOwner++;
    out[r.id] = { owners, referral };
    for (const o of owners) tally[o] = (tally[o] || 0) + 1;
  }
}
fs.writeFileSync(path.join(ROOT, 'raw/admin-commercial.json'), JSON.stringify(out));
console.log('clients ' + n + '  with a commercial owner ' + withOwner + '  (via referral code only: ' + viaReferral + ')');
for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log('  ' + k.padEnd(28) + String(v).padStart(4));
console.log('wrote raw/admin-commercial.json');
