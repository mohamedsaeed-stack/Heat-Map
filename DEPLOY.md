# Deploying to Railway

The map is a static page plus its JSON. `scripts/serve.js` serves both; there are no
dependencies, so the build is just `npm install` doing nothing and `npm start`.

## Before the first deploy — read this

**The map is not public data.** Every pin carries a company name, and the popups link to the
HubSpot record and the admin-app client page. A Railway service gets a public
`*.up.railway.app` URL the moment you generate a domain. Set the two auth variables below
*before* generating that domain, or the client book is on the open internet.

The server starts either way — it prints `basic auth: OFF` when the variables are missing.

## Deploy

1. **Push the repo** to GitHub (Railway deploys from a branch).

2. **New project** → *Deploy from GitHub repo* → pick `Heat-Map`.

   Railway reads `railway.json`, detects Node from `package.json`, and runs `npm start`.
   Nothing else to configure.

3. **Set the password**, in *Variables*:

   | Variable | Value |
   |---|---|
   | `BASIC_AUTH_USER` | whatever you want, e.g. `flapkap` |
   | `BASIC_AUTH_PASS` | a long random string |

   Do **not** set `PORT` — Railway injects it, and the server reads it.

4. **Generate a domain**: *Settings → Networking → Generate Domain*. Open it; the browser
   asks for the username and password.

The health check is `GET /healthz`, which answers before the auth check so a password does
not fail the deploy.

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
