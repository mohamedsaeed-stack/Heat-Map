# FlapKap Coverage Map

A map showing where businesses exist, which of them are on the CRM, which are in process, which were
lost and which are funded clients, filtered by category, with an explainer on every figure.

**Live page: https://claude.ai/artifact/PYQb7axx5DtTWS8kYV47sv** — private, and republished to this
same URL on every change. Never make it public.

Owner: Mohamed Saeed, RevOps. Agreed as a side project with Amr Ibrahim, Head of RevOps.

- `PLAN.md` — the approved plan. Read it before changing anything here.
- `heatmap-project-brief.md` — the predecessor brief, kept as history. **Its Abu Dhabi demo numbers
  are not reused**; that demo's 256-lead stat card does not reconcile with its own table, and its
  lead pins were invented coordinates.

## Scope: the UAE, not only Dubai

The user widened the scope on 19 Sep 2026: **the whole UAE**, not Dubai alone.

The page is built for that from the start. Map bounds cover the UAE, and nothing in the data model
assumes one emirate. What is not there yet is the **data**: every measured lookup in `lookups/` was
queried with `city LIKE '%dubai%'`, so Dubai is the only emirate with real numbers today.

Extending needs three things, and none of them is a rebuild:

| Step | Work |
|---|---|
| City variants per emirate | Repeat the `%dubai%` spelling exercise for Abu Dhabi, Sharjah, Ajman, Ras Al Khaimah, Fujairah, Umm Al Quwain and Al Ain. Dubai alone had 18 spellings, two of which were Saudi Arabia. |
| Areas per emirate | `lookups/dubai-communities.json` covers 91 Dubai communities. Each further emirate needs its own list, geocoded the same way. |
| Re-run the counts | Lifecycle, industry and customer counts, UAE-wide rather than Dubai-only. |

Until that is done the page states plainly which emirate its figures cover.

## Layout

```
lookups/    reference data, committed, reviewed before use
scripts/    Node - pull, locate, aggregate, build data files
data/       what the page publishes, and only what it publishes. No PII.
page/       index.html, the source of truth for the published page
raw/        gitignored - raw pulls and any vendor token
```

`data/` holds business names, record ids, category, stage, community and coordinates. No phone
numbers, no emails, no balances, no trade-licence detail, anywhere in the repo.

## Running anything

Node 24 is installed but **not on PATH**. Every shell that runs `node` or `npm` needs this first:

```bash
export PATH="/c/Users/Mohamed/AppData/Local/Microsoft/WinGet/Packages/OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe/node-v24.19.0-win-x64:$PATH"
```

There is no Python on this machine.

| Script | What it does |
|---|---|
| `scripts/lib/communities.js` | Maps free text to a community. Run it directly for its self-test. |
| `scripts/geocode-communities.js` | Real centroids from Nominatim. Resumable; `--redo` refetches. |
| `scripts/build-meta.js` | Builds `data/meta.json` and cross-checks every total. |

## What W0 established

### The page must survive a blocked basemap, so it does

The published-artifact viewer enforces a content security policy. Two things were measured, not
assumed:

- **External stylesheets are blocked.** Leaflet's CSS is inlined into `page/index.html` as a result.
  Only Google Fonts may stay external. Scripts from cdnjs are allowed.
- **Leaflet's CSS references four images relatively.** Once inlined those 404, so the page uses
  `L.circleMarker` and never a default marker icon.

Rather than depend on one tile provider being allowed, the page **tries three in order and uses the
first that actually delivers tiles**: CARTO Voyager, then OpenStreetMap, then Esri satellite. A
provider that fails is struck through in the basemap switcher. If all three fail the page says so
instead of showing a blank grid. A separate four-provider diagnostic is at
https://claude.ai/artifact/JQNGKJaEbmNqKR3rL3d1uu.

### Community centroids are real, and the first attempt was wrong

`scripts/geocode-communities.js` takes centroids from OpenStreetMap through Nominatim, free, one
request per second, with an identifying User-Agent. No coordinate in this project is invented.

The first run accepted Nominatim's first result and looked fine. It was wrong: **13 of 90 results
were transport features**, not areas. Hatta resolved to a road 90 km from the town, Al Fahidi to a
shop, Al Safa to a metro station in a different district. Each would have moved a whole community's
worth of pins with no error raised.

The script now accepts only OSM `place`, `boundary` and `landuse` features, retries a refused name
with alternative queries, and records what it refused. **88 of 91** communities have a centroid.
Al Khail Gate, Al Thanyah and Dubai Sports City do not, and anything there stays unlocated.

### One reconciliation, worth remembering

`city LIKE '%dubai%'` returns **19,974** companies. One of them has city `abu dhabi / dubai` and is
excluded as ambiguous, leaving **19,973** for Dubai proper. The lifecycle and industry breakdowns
total 19,974 because they were queried before that exclusion. `lookups/dubai-city-variants.tsv` calls
19,974 the "yes rows" total, which is the one figure in that file that does not hold up.

### Admin-app probe: not run

The `FlapKap-Admin` connector exposes no tools in this session. See `lookups/admin-fields.md`.

## Cost rules in force

- **No paid credits.** Not Clay, Apollo, Lusha, Apify or Google Places. Overpass and Nominatim are
  free and are used inside their published policies.
- Every vendor spend is gated on an explicit yes, with the count and the estimate stated first.
- Nothing is published publicly. The page stays private and is republished to the same URL.
