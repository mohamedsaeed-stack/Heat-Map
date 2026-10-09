'use strict';
// Who was actually DISBURSED, from the admin app's invoices (flapkap_list_invoices),
// and the financing history of each: how many times, first/last date, ongoing or ended.
//
//   node scripts/admin-finance.js <invoices-spill.json> <clients-spill.json>
//
// Funded = at least one APPROVED invoice with a DISBURSED_AMOUNT item. This is
// broader than financingStatus = REFINANCING, which only marks round 2+ (385 of the
// 545 disbursed on 9 Oct 2026; the other 160 were funded once).
// A financing = one client x one calendar day (disbursement-classification skill).
// Date = invoice.disbursementDate, else createdAt (flagged approx; 986 of 1,655 rows).
// No amounts are written: only counts and dates reach the map.
// Output: raw/admin-finance.json { businessId: {n, first, last, approx, ongoing, end} }
//         raw/funded-ids.json (every disbursed client) and part-11 stubs for those the
//         per-client licence pull never saw.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const [invFile, cliFile] = process.argv.slice(2);
const inv = JSON.parse(fs.readFileSync(invFile, 'utf8')).invoices;
const clients = JSON.parse(fs.readFileSync(cliFile, 'utf8')).businesses;
const cl = new Map(clients.map(c => [c.businessId, c]));
const today = new Date().toISOString().slice(0, 10);

const by = {};
for (const i of inv) {
  if (i.status !== 'APPROVED') continue;
  const it = (i.invoiceItems || []).find(x => x.type === 'DISBURSED_AMOUNT');
  if (!it || !(it.amount > 0)) continue;
  const rr = i.repaymentRequests || [];
  const b = rr[0] && rr[0].businessId;
  if (!b) continue;
  const o = (by[b] = by[b] || { days: new Set(), approx: false, open: 0, due: [], paid: [] });
  const d = (i.disbursementDate || i.createdAt || '').slice(0, 10);
  if (!i.disbursementDate) o.approx = true;
  o.days.add(d);
  for (const r of rr) {
    o.open += r.openAmount || 0;
    if (r.requestDate) o.due.push(r.requestDate);
    if (r.actualRepaymentDate) o.paid.push(String(r.actualRepaymentDate).slice(0, 10));
  }
}
const out = {};
for (const [b, o] of Object.entries(by)) {
  const days = [...o.days].filter(Boolean).sort();
  const ongoing = o.open > 0;
  out[b] = {
    n: days.length, first: days[0], last: days[days.length - 1], approx: o.approx,
    ongoing,
    end: ongoing ? o.due.sort().pop() : (o.paid.sort().pop() || o.due.sort().pop() || null),
  };
}
fs.writeFileSync(path.join(ROOT, 'raw/admin-finance.json'), JSON.stringify(out));

// funded-ids = every disbursed client; stubs for the ones with no licence pull yet.
const have = new Set();
for (const f of fs.readdirSync(path.join(ROOT, 'raw')).filter(f => /^admin-licence-part-\d+\.json$/.test(f)))
  for (const r of JSON.parse(fs.readFileSync(path.join(ROOT, 'raw', f), 'utf8'))) if (r && r.id) have.add(r.id);
const stubs = [];
for (const b of Object.keys(out)) {
  const c = cl.get(b); if (!c || have.has(b)) continue;
  stubs.push({ id: b, name: c.businessInfo.companyName, licences: [], legalAddresses: [], website: null,
    country: c.businessInfo.country || null, phoneEmirate: null, financingStatus: c.financingStatus,
    lastDisbursementDate: out[b].last, stub: true });
}
fs.writeFileSync(path.join(ROOT, 'raw/admin-licence-part-11.json'), JSON.stringify(stubs));
fs.writeFileSync(path.join(ROOT, 'raw/funded-ids.json'),
  JSON.stringify(Object.keys(out).filter(b => cl.has(b)).map(b => ({ id: b, name: cl.get(b).businessInfo.companyName }))));
const n = a => Object.values(out).filter(a).length;
console.log('disbursed clients ' + Object.keys(out).length + '  once ' + n(x => x.n === 1) + '  repeat ' + n(x => x.n > 1) +
  '  ongoing ' + n(x => x.ongoing) + '  ended ' + n(x => !x.ongoing) + '  approx dates ' + n(x => x.approx) + '  stubs ' + stubs.length);
