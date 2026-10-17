'use strict';
// Click-to-call from a map popup, through ZIWO (the cloud contact centre our reps
// already dial from, integrated with HubSpot).
//
// The page never sees a phone number. It sends a HubSpot contact id and the rep's
// name; this module looks the number up live in HubSpot, then asks ZIWO's admin CTI
// API to ring that rep's softphone and, once they answer, dial the contact. So the
// number is only ever in this process's memory for the length of one request - it is
// not logged and not returned.
//
// No dependencies; global fetch (Node 20).
//
// Required env (all four, or the feature stays off and the page falls back to
// opening the contact in HubSpot):
//   ZIWO_INSTANCE   the ZIWO instance name - the "acme" in acme-api.aswat.co
//   ZIWO_API_KEY    ZIWO admin API key, sent as the api_key header
//   ZIWO_AGENTS     JSON {"Rep Name":"ziwoCcLogin", ...}. Names go to the page;
//                   ccLogins never leave the server.
//   HUBSPOT_TOKEN   HubSpot private-app token, scope crm.objects.contacts.read

const INSTANCE = (process.env.ZIWO_INSTANCE || '').trim();
const API_KEY = process.env.ZIWO_API_KEY || '';
const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN || '';

let AGENTS = {};
try {
  const a = JSON.parse(process.env.ZIWO_AGENTS || '{}');
  if (a && typeof a === 'object' && !Array.isArray(a)) {
    for (const [name, login] of Object.entries(a)) if (name && login) AGENTS[name] = String(login);
  }
} catch (e) {
  console.error('ZIWO_AGENTS is not valid JSON - click-to-call stays off');
  AGENTS = {};
}

const CONFIGURED = Boolean(INSTANCE && API_KEY && HUBSPOT_TOKEN && Object.keys(AGENTS).length);
const MAX_BODY = 2048;   // {"contactId":"...","agent":"..."} is under 200 bytes

function send(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

// GET /api/call-config - rep names only, never the ccLogins or the keys.
function handleConfig(req, res) {
  send(res, 200, { enabled: CONFIGURED, agents: CONFIGURED ? Object.keys(AGENTS).sort() : [] });
}

// HubSpot numbers are typed by hand: "050 123 4567", "+971-4-123 4567",
// "00971501234567", "971501234567", "501234567". Anything that starts with 0 (but
// not 00) is a UAE local number. Returns E.164, or null when it cannot be read.
function normalisePhone(raw) {
  if (!raw) return null;
  let s = String(raw).split(/\s*(?:ext\.?|x|#)\s*\d*\s*$/i)[0].trim();   // drop an extension
  const plus = s.startsWith('+');
  let d = s.replace(/\D/g, '');
  if (!d) return null;
  if (plus) d = '+' + d;
  else if (d.startsWith('00')) d = '+' + d.slice(2);
  else if (d.startsWith('971') && d.length >= 11) d = '+' + d;
  else if (d.startsWith('0')) d = '+971' + d.slice(1);
  else if (/^5\d{8}$/.test(d)) d = '+971' + d;   // UAE mobile typed without the 0
  else return null;
  return /^\+[1-9]\d{7,14}$/.test(d) ? d : null;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0, over = false;
    const parts = [];
    req.on('data', (chunk) => {
      if (over) return;   // keep draining so the 413 still reaches the client
      size += chunk.length;
      if (size > MAX_BODY) { over = true; parts.length = 0; reject(Object.assign(new Error('too large'), { status: 413 })); return; }
      parts.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(parts).toString('utf8')));
    req.on('error', reject);
  });
}

// ZIWO or HubSpot error text is passed on to the rep, minus anything that could be
// a phone number.
function scrub(s) { return String(s || '').replace(/\+?\d[\d\s-]{5,}\d/g, '[number]').slice(0, 200); }

// POST /api/call {"contactId":"123","agent":"Rep Name"}
async function handleCall(req, res) {
  if (!CONFIGURED) return send(res, 503, { ok: false, error: 'Click-to-call is not set up on this server.' });

  // Only our own page may trigger a call. A JSON content type cannot be sent cross-site
  // without a CORS preflight (which this server never answers), and a browser that does
  // send Origin must name this host. Together these stop another site from making a
  // signed-in rep's browser place calls.
  if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) {
    return send(res, 415, { ok: false, error: 'Expected JSON.' });
  }
  const origin = req.headers.origin;
  if (origin) {
    let host = '';
    try { host = new URL(origin).host; } catch (e) {}
    if (host !== req.headers.host) return send(res, 403, { ok: false, error: 'Wrong origin.' });
  }

  let body;
  try { body = JSON.parse(await readBody(req)); }
  catch (e) { return send(res, e.status || 400, { ok: false, error: e.status === 413 ? 'Request too large.' : 'Bad JSON.' }); }

  const contactId = String((body && body.contactId) || '');
  const agent = String((body && body.agent) || '');
  if (!/^\d{1,20}$/.test(contactId)) return send(res, 400, { ok: false, error: 'Bad contact id.' });
  if (!Object.prototype.hasOwnProperty.call(AGENTS, agent)) return send(res, 400, { ok: false, error: 'Unknown rep name.' });

  // 1. The number, live from HubSpot. phone first, mobilephone as the fallback.
  let number = null;
  try {
    const r = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/' + contactId + '?properties=phone,mobilephone', {
      headers: { 'Authorization': 'Bearer ' + HUBSPOT_TOKEN },
      signal: AbortSignal.timeout(10000),
    });
    if (r.status === 404) return send(res, 404, { ok: false, error: 'Contact not found in HubSpot.' });
    if (!r.ok) {
      console.error('call: HubSpot lookup failed, contact ' + contactId + ', HTTP ' + r.status);
      return send(res, 502, { ok: false, error: 'HubSpot lookup failed (HTTP ' + r.status + ').' });
    }
    const p = ((await r.json()) || {}).properties || {};
    if (!p.phone && !p.mobilephone) return send(res, 422, { ok: false, error: 'This contact has no phone number in HubSpot.' });
    number = normalisePhone(p.phone) || normalisePhone(p.mobilephone);
    if (!number) return send(res, 422, { ok: false, error: 'The phone number in HubSpot is not in a format that can be dialled. Fix it on the contact record.' });
  } catch (e) {
    console.error('call: HubSpot lookup error, contact ' + contactId + ': ' + e.name);
    return send(res, 502, { ok: false, error: 'Could not reach HubSpot.' });
  }

  // 2. ZIWO rings the rep's softphone, then dials the number when they answer.
  try {
    const url = 'https://' + encodeURIComponent(INSTANCE) + '-api.aswat.co/integrations/cti/agents/' +
      encodeURIComponent(AGENTS[agent]) + '/call';
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'api_key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) {
      let msg = '';
      try { const j = await r.json(); msg = (j && (j.message || (j.error && (j.error.message || j.error)))) || ''; } catch (e) {}
      console.error('call: ZIWO refused, agent ' + agent + ', contact ' + contactId + ', HTTP ' + r.status);
      return send(res, 502, { ok: false, error: 'ZIWO refused the call (HTTP ' + r.status + ')' + (msg ? ': ' + scrub(typeof msg === 'string' ? msg : JSON.stringify(msg)).replace(/\.?$/, '.') : '.') + ' Is your ZIWO softphone logged in?' });
    }
  } catch (e) {
    console.error('call: ZIWO error, agent ' + agent + ', contact ' + contactId + ': ' + e.name);
    return send(res, 502, { ok: false, error: 'Could not reach ZIWO.' });
  }
  console.log('call: ' + agent + ' -> contact ' + contactId + ' ok');
  return send(res, 200, { ok: true });
}

module.exports = { CONFIGURED, handleConfig, handleCall, normalisePhone };
