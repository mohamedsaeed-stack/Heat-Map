'use strict';
// GET /api/contacts?company=<HubSpot company id> - the top 3 contacts for a pin card,
// read live from HubSpot when the card opens.
//
// Live, not a data file: names and job titles of ~63k people stay out of the repo and
// the page payload (17 Oct 2026), and the card is always current. Phone numbers are
// read only to set the hasPhone flag; they are never returned or logged.
//
// Env: HUBSPOT_TOKEN, a private-app token with crm.objects.contacts.read and
// crm.objects.companies.read. Without it the endpoint answers 503 and the card says so.

const { top3 } = require('./contact-rank');

const TOKEN = process.env.HUBSPOT_TOKEN || '';
const CONFIGURED = Boolean(TOKEN);
const PROPS = ['firstname', 'lastname', 'jobtitle', 'phone', 'mobilephone', 'notes_last_contacted', 'createdate'];

// A card is reopened often while a rep plans a day; keep answers for 10 minutes.
const TTL = 10 * 60 * 1000;
const MAX_CACHE = 5000;
const cache = new Map();

function send(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

async function hs(url, init) {
  const r = await fetch(url, Object.assign({ signal: AbortSignal.timeout(10000) }, init, {
    headers: Object.assign({ 'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json' }, (init || {}).headers),
  }));
  if (!r.ok) throw Object.assign(new Error('HubSpot HTTP ' + r.status), { status: r.status });
  return r.json();
}

async function rowsFor(company) {
  const assoc = await hs('https://api.hubapi.com/crm/v4/objects/companies/' + company + '/associations/contacts?limit=500');
  const ids = [...new Set((assoc.results || []).map(a => String(a.toObjectId)))].slice(0, 100);   // batch read caps at 100
  if (!ids.length) return [];
  const batch = await hs('https://api.hubapi.com/crm/v3/objects/contacts/batch/read', {
    method: 'POST',
    body: JSON.stringify({ properties: PROPS, inputs: ids.map(id => ({ id })) }),
  });
  return top3((batch.results || []).map(c => Object.assign({}, c.properties, { hs_object_id: c.id })));
}

async function handle(req, res) {
  if (!CONFIGURED) return send(res, 503, { error: 'HUBSPOT_TOKEN is not set on this server.' });
  const company = new URL(req.url, 'http://x').searchParams.get('company') || '';
  if (!/^\d{1,20}$/.test(company)) return send(res, 400, { error: 'Bad company id.' });

  const hit = cache.get(company);
  if (hit && Date.now() - hit.at < TTL) return send(res, 200, { rows: hit.rows });

  try {
    const rows = await rowsFor(company);
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
    cache.set(company, { at: Date.now(), rows });
    send(res, 200, { rows });
  } catch (e) {
    console.error('contacts: company ' + company + ': ' + (e.status ? 'HTTP ' + e.status : e.name));
    send(res, e.status === 404 ? 404 : 502, { error: 'HubSpot lookup failed.' });
  }
}

module.exports = { CONFIGURED, handle };
