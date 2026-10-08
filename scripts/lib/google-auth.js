'use strict';
// Google sign-in for the coverage map, restricted to one Google Workspace domain.
//
// Why this and not Basic auth: the map carries client names, outstanding book and
// HubSpot/admin links. A shared password is one forward away from being outside the
// company, and it cannot be revoked per person. Google sign-in means access follows
// the Workspace account - someone who leaves loses the map the moment IT disables them.
//
// No dependencies. Authorization-code flow against Google, HMAC-signed session cookie.
//
// Required env:
//   GOOGLE_CLIENT_ID      OAuth 2.0 Web client id
//   GOOGLE_CLIENT_SECRET  that client's secret
//   SESSION_SECRET        any long random string; signs the session cookie
// Optional:
//   ALLOWED_DOMAIN        Workspace domain allowed in (default flapkap.com)
//   ALLOWED_EMAILS        extra individual addresses, comma separated, for people
//                         outside the domain (contractors, a board member)
//   PUBLIC_URL            https://your-app.up.railway.app - only needed if the
//                         redirect lands on the wrong host behind a proxy

const crypto = require('crypto');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const ALLOWED_DOMAIN = (process.env.ALLOWED_DOMAIN || 'flapkap.com').toLowerCase();
const ALLOWED_EMAILS = new Set(
  (process.env.ALLOWED_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
);

const CONFIGURED = Boolean(CLIENT_ID && CLIENT_SECRET && SESSION_SECRET);

const SESSION_COOKIE = 'fk_session';
const FLOW_COOKIE = 'fk_oauth';
const SESSION_TTL_SEC = 12 * 60 * 60; // a working day; they re-auth tomorrow
const FLOW_TTL_SEC = 10 * 60;

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

// ---------------------------------------------------------------- cookies

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function cookie(name, value, { maxAge, secure }) {
  const bits = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  if (secure) bits.push('Secure');
  return bits.join('; ');
}

// Railway terminates TLS at its edge and forwards plain HTTP, so the socket is
// never encrypted here - trust the proxy header and fall back to "not localhost".
function isSecure(req) {
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  if (proto) return proto === 'https';
  return !/^localhost|^127\.0\.0\.1|^\[::1\]/.test(String(req.headers.host || ''));
}

function originOf(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/+$/, '');
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  return `${isSecure(req) ? 'https' : 'http'}://${host}`;
}

// ---------------------------------------------------------------- signing

function sign(payload) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
}

function seal(obj) {
  const body = Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${body}.${sign(body)}`;
}

function unseal(token) {
  const value = String(token || '');
  const dot = value.lastIndexOf('.');
  if (dot < 1) return null;
  const body = value.slice(0, dot);
  const got = Buffer.from(value.slice(dot + 1));
  const want = Buffer.from(sign(body));
  // Compare every time and only on equal lengths - timingSafeEqual throws otherwise.
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
  try {
    const obj = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!obj || typeof obj.exp !== 'number' || obj.exp < Math.floor(Date.now() / 1000)) return null;
    return obj;
  } catch { return null; }
}

// ---------------------------------------------------------------- policy

function emailAllowed(claims) {
  const email = String(claims.email || '').toLowerCase();
  if (!email || claims.email_verified !== true) return false;
  if (ALLOWED_EMAILS.has(email)) return true;
  // hd is the Workspace domain Google itself asserts. Checking the email suffix
  // alone would let gmail.com addresses shaped like "x@flapkap.com.evil.com" through
  // on a sloppier comparison, and would not catch a personal account that merely
  // uses the name. Require both.
  return String(claims.hd || '').toLowerCase() === ALLOWED_DOMAIN
    && email.endsWith('@' + ALLOWED_DOMAIN);
}

// The id_token comes straight back from Google's token endpoint over TLS in the
// authorization-code flow, so its signature has already been established by the
// transport. Google's own guidance allows skipping JWKS verification on this path.
// Everything a signature would not tell us is still checked below.
function claimsFrom(idToken, nonce) {
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) return null;
  let claims;
  try { claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); }
  catch { return null; }

  const now = Math.floor(Date.now() / 1000);
  if (claims.aud !== CLIENT_ID) return null;
  if (!/^(https:\/\/)?accounts\.google\.com$/.test(String(claims.iss || ''))) return null;
  if (typeof claims.exp !== 'number' || claims.exp < now) return null;
  if (claims.nonce !== nonce) return null;
  return claims;
}

// ---------------------------------------------------------------- pages

function signInPage(origin, message) {
  const note = message
    ? `<p class="err">${message.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</p>`
    : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>FlapKap Coverage Map</title>
<style>
  :root { color-scheme: light dark; --bg:#f6f7f9; --card:#fff; --ink:#0f1b2d; --muted:#5b6b82; --line:#e3e8ef; --accent:#1a56db; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0f1b2d; --card:#16243a; --ink:#eef2f7; --muted:#9fb0c6; --line:#24374f; --accent:#6c9bff; } }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:grid; place-items:center; padding:16px;
         background:var(--bg); color:var(--ink);
         font:15px/1.5 Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:14px;
          padding:32px; max-width:380px; width:100%; text-align:center;
          box-shadow:0 1px 3px rgba(0,0,0,.06); }
  h1 { font-size:18px; margin:0 0 6px; }
  p { color:var(--muted); font-size:13px; margin:0 0 20px; }
  .err { color:#b42318; }
  a.btn { display:block; padding:11px 16px; border-radius:9px; background:var(--accent);
          color:#fff; text-decoration:none; font-weight:600; font-size:14px; }
</style></head><body><div class="card">
<h1>FlapKap Coverage Map</h1>
${note}
<p>Sign in with your ${ALLOWED_DOMAIN} account.</p>
<a class="btn" href="${origin}/auth/login">Sign in with Google</a>
</div></body></html>`;
}

// ---------------------------------------------------------------- handler

// Returns true when it has answered the request itself (sign-in page, redirect,
// callback). Returns false when the caller should go on and serve the file.
async function handle(req, res, pathname) {
  if (!CONFIGURED) return false; // caller decides what unconfigured means

  const cookies = parseCookies(req.headers.cookie);
  const origin = originOf(req);
  const secure = isSecure(req);

  if (pathname === '/auth/logout') {
    res.writeHead(302, {
      'Location': origin + '/',
      'Set-Cookie': cookie(SESSION_COOKIE, '', { maxAge: 0, secure }),
    });
    res.end();
    return true;
  }

  if (pathname === '/auth/login') {
    const state = crypto.randomBytes(16).toString('base64url');
    const nonce = crypto.randomBytes(16).toString('base64url');
    const flow = seal({ state, nonce, exp: Math.floor(Date.now() / 1000) + FLOW_TTL_SEC });
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: origin + '/auth/callback',
      response_type: 'code',
      scope: 'openid email',
      state,
      nonce,
      // hd pre-filters the account chooser. It is a hint, not enforcement -
      // the real check is on the hd claim in emailAllowed().
      hd: ALLOWED_DOMAIN,
      prompt: 'select_account',
    });
    res.writeHead(302, {
      'Location': `${AUTH_ENDPOINT}?${params}`,
      'Set-Cookie': cookie(FLOW_COOKIE, flow, { maxAge: FLOW_TTL_SEC, secure }),
    });
    res.end();
    return true;
  }

  if (pathname === '/auth/callback') {
    const url = new URL(req.url, origin);
    const flow = unseal(cookies[FLOW_COOKIE]);
    const clearFlow = cookie(FLOW_COOKIE, '', { maxAge: 0, secure });

    const fail = (msg) => {
      res.writeHead(401, { 'Content-Type': 'text/html; charset=utf-8', 'Set-Cookie': clearFlow });
      res.end(signInPage(origin, msg));
    };

    if (url.searchParams.get('error')) return fail('Google returned: ' + url.searchParams.get('error')), true;
    if (!flow) return fail('That sign-in link expired. Try again.'), true;
    if (url.searchParams.get('state') !== flow.state) return fail('Sign-in could not be verified. Try again.'), true;

    const code = url.searchParams.get('code');
    if (!code) return fail('No authorization code came back from Google.'), true;

    let claims = null;
    try {
      const resp = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          redirect_uri: origin + '/auth/callback',
          grant_type: 'authorization_code',
        }),
      });
      if (resp.ok) claims = claimsFrom((await resp.json()).id_token, flow.nonce);
      else console.error('token exchange failed:', resp.status);
    } catch (e) {
      console.error('token exchange error:', e.message);
    }

    if (!claims) return fail('Sign-in failed. Try again.'), true;
    if (!emailAllowed(claims)) {
      console.warn('denied sign-in for', claims.email, 'hd=' + claims.hd);
      return fail(`${claims.email || 'That account'} is not a ${ALLOWED_DOMAIN} account.`), true;
    }

    const session = seal({ email: claims.email, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SEC });
    res.writeHead(302, {
      'Location': origin + '/',
      'Set-Cookie': [clearFlow, cookie(SESSION_COOKIE, session, { maxAge: SESSION_TTL_SEC, secure })],
    });
    res.end();
    return true;
  }

  if (unseal(cookies[SESSION_COOKIE])) return false; // signed in, serve the file

  // Not signed in. The page fetches data/*.json with fetch(), and an HTML sign-in
  // page would land there as a JSON parse error with no explanation - answer those
  // with a 401 the console can read instead.
  if (pathname.startsWith('/data/')) {
    res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'not signed in', signIn: origin + '/auth/login' }));
    return true;
  }

  res.writeHead(401, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(signInPage(origin));
  return true;
}

module.exports = { handle, CONFIGURED, ALLOWED_DOMAIN };
