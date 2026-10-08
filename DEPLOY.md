# Deploying to Railway

## Live — 8 Oct 2026

**https://coverage-map-production.up.railway.app** — behind a shared password.

The username is `flapkap`; the password is in Railway's variables, not in this repo. Ask
Mohamed, or read `BASIC_AUTH_PASS` in the service's Variables tab.

Verified against the live URL on deploy: `/` and `/data/*.json` answer 401 without the
password and 200 with it, `/healthz` answers 200 to anyone so the health check cannot be
locked out, and `map-uae.json` goes over the wire as 2.07 MB of the 12 MB on disk.

Upgrading to Google sign-in later needs no code change and no redeploy of a different
build: set the three Google variables and `google-auth.js` takes over, same URL.

| | |
|---|---|
| Project | `flapkap-coverage-map` · `bebd91d0-0ced-4747-be9e-be2ffe04e909` |
| Environment | `production` · `12ef971d-0e07-4703-af3b-c2557cfcaf50` |
| Service | `coverage-map` · `80d0e768-644f-4385-a52f-8b68d286e92d` |
| Source | `mohamedsaeed-stack/Heat-Map`, branch `main`, auto-deploys on push |
| Domain | none yet — **deliberately** |

**To finish, in this order.** Either auth works; the quick one is the password.

1. Set auth variables — *either* `BASIC_AUTH_USER` + `BASIC_AUTH_PASS` (two minutes, no
   external setup), *or* the three Google variables below (better revocation, needs a
   Google Cloud OAuth client first).
2. Only then generate the domain. A domain on a service with no auth variables serves the
   whole client book to anyone with the URL — the server prints `auth: OFF` and keeps going.
3. For Google only: add `https://<that-domain>/auth/callback` to the OAuth client.



The map is a static page plus its JSON. `scripts/serve.js` serves both; there are no
dependencies, so the build is just `npm install` doing nothing and `npm start`.

## Before the first deploy — read this

**The map is not public data.** Every pin carries a company name, and the popups link to the
HubSpot record and the admin-app client page. A Railway service gets a public
`*.up.railway.app` URL the moment you generate a domain. Set the auth variables below
*before* generating that domain, or the client book is on the open internet.

The server starts either way — it prints `auth: OFF` when the variables are missing.

**Access is Google sign-in, flapkap.com accounts only.** Not a shared password: a password
gets forwarded once and is then outside the company for good, and it cannot be taken back
from one person. With Google, access follows the Workspace account — someone who leaves
loses the map the moment IT disables them. `ALLOWED_EMAILS` exists for the occasional
person outside the domain.

## One-time Google setup

You do this part — it is in your Google account and involves a client secret, so I cannot.

1. [console.cloud.google.com](https://console.cloud.google.com) → create a project (or reuse one).
2. **APIs & Services → OAuth consent screen** → *Internal* (that alone restricts it to
   flapkap.com) → app name "FlapKap Coverage Map" → save.
3. **Credentials → Create credentials → OAuth client ID** → *Web application*.
   - **Authorised redirect URI:** `https://YOUR-DOMAIN/auth/callback`
     You get `YOUR-DOMAIN` from step 4 below, so do that first and come back, or add it
     after and let Railway redeploy.
4. Copy the **client ID** and **client secret** — they go into Railway next.

## Deploy

1. **Push the repo** to GitHub (Railway deploys from a branch).

2. **New project** → *Deploy from GitHub repo* → pick `Heat-Map`.

   Railway reads `railway.json`, detects Node from `package.json`, and runs `npm start`.
   Nothing else to configure.

3. **Set the variables**, in *Variables*:

   | Variable | Value |
   |---|---|
   | `GOOGLE_CLIENT_ID` | from the Google step above |
   | `GOOGLE_CLIENT_SECRET` | from the Google step above |
   | `SESSION_SECRET` | a long random string — signs the session cookie |
   | `ALLOWED_DOMAIN` | optional; defaults to `flapkap.com` |
   | `ALLOWED_EMAILS` | optional; comma-separated addresses outside the domain |

   Do **not** set `PORT` — Railway injects it, and the server reads it.

   A good `SESSION_SECRET`: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`

4. **Generate a domain**: *Settings → Networking → Generate Domain*. Put that domain into
   the Google redirect URI as `https://THAT-DOMAIN/auth/callback`.

5. Open the domain. You get a sign-in card; signing in with a flapkap.com account lands you
   on the map. Any other account is refused by name, and the refusal is logged.

The health check is `GET /healthz`, which answers before the auth check so sign-in cannot
fail the deploy.

### How the auth works, briefly

Authorization-code flow, no dependencies (`scripts/lib/google-auth.js`). The session is an
HMAC-signed cookie, HttpOnly, SameSite=Lax, Secure behind Railway's TLS, 12 hours. Google's
`hd` claim *and* the email suffix must both say flapkap.com — the suffix alone would accept
a lookalike domain. `/auth/logout` clears the session. Unauthenticated requests to
`/data/*.json` get a 401 JSON body rather than the HTML card, so a signed-out tab fails
visibly in the console instead of as a JSON parse error.

## What is served

| URL | File |
|---|---|
| `/` | `page/index.html` — the coverage map |
| `/data/*.json` | the map data the page fetches |
| `/healthz` | `ok`, for Railway |

Anything else resolves under `page/`. Paths that try to escape the repo get a 403.

`data/map-uae.json` is 8 MB and `data/map.json` 6 MB, so responses are gzipped when the
browser accepts it — 8.2 MB goes over the wire as 1.4 MB. Files are also ETagged, so a
reload after the first visit is a 304 and no bytes.

## Redeploying after a data rebuild

The data files are committed, so a rebuild is a normal commit:

```bash
node scripts/allocate-places.js
node scripts/scatter-pins.js
node scripts/build-map-data-uae.js
git add data && git commit -m "Rebuild map data" && git push
```

Railway redeploys on push. The `must-revalidate` cache header means returning visitors pick
up the new data on their next load rather than holding a stale copy.

## Local

```bash
npm run dev          # http://localhost:8099
```

## Not deployed by this

`dist/flapkap-uae-map.html` — the single-file UAE map with the tiles baked in — is built
from `raw/tiles/`, which is gitignored and not in the repo. It stays a local artefact, built
and shared as a file. The hosted page is `page/index.html`, which pulls its tiles from
OpenStreetMap at run time and so needs no baked tiles.
