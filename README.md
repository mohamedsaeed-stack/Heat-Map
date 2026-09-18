# FlapKap Coverage Map

A map showing where businesses exist, which of them are on the CRM, which are in process, which were
lost and which are funded clients, filtered by category, with an explainer on every figure.

**Live page: https://claude.ai/artifact/PYQb7axx5DtTWS8kYV47sv** — private, and republished to this
same URL on every change. Never make it public.

Owner: Mohamed Saeed, RevOps. Agreed as a side project with Amr Ibrahim, Head of RevOps.

- `PLAN.md` — the approved plan. Read it before changing anything here.
- `START-HERE.md` — handoff for the next session: what is done, what is blocked, what is next.
- `heatmap-project-brief.md` — the predecessor brief, kept as history. **Its Abu Dhabi demo numbers
  are not reused**; that demo's stat card does not reconcile with its own table, and its lead pins
  were invented coordinates.

## State in one line

The market universe is **built and on the map**: 18,018 real businesses. The four CRM layers are
**counted but not placed**, because no HubSpot or admin-app connector exists in the session that
built this. Nothing is faked to fill the gap.

## Scope: the UAE, not only Dubai

The user widened the scope on 19 Sep 2026 to the whole UAE. The page is built for that: map bounds
cover the country, and `lookups/uae-emirate-areas.json` already holds the OpenStreetMap boundary for
all seven emirates, so the universe pull extends with one flag.

The **data** is Dubai-only so far, because every committed CRM lookup was queried with a Dubai city
filter. Extending needs:

| Step | Work |
|---|---|
| City variants per emirate | Repeat the Dubai spelling exercise for the other six. Dubai alone had 18 spellings, two of which turned out to be in Saudi Arabia. |
| Areas per emirate | `lookups/dubai-communities.json` covers 91 Dubai communities. Each further emirate needs its own list, geocoded the same way. |
| Re-run the counts | Lifecycle, industry and customer counts, UAE-wide. |
| Universe | Already solved. Run the puller with its emirate flag. |

## The universe layer: 18,018 real businesses

From OpenStreetMap through the free Overpass API, inside the Dubai **emirate** boundary. Every pin
carries its own coordinates and its OSM id. This is the one layer that needed no connector, no
account and no vendor credit.

| Category | Places | Quality |
|---|---:|---|
| Retail | 8,902 | usable |
| Hospitality & F&B | 5,480 | usable |
| Auto parts & automotive | 1,006 | usable |
| Medical & healthcare | 981 | usable |
| Contracting, fitouts, FFE | 827 | thin |
| Manufacturing & general trading | 798 | thin |
| Marketing & advertising | 24 | thin |

**Thin means coverage must not be computed from it.** OpenStreetMap is volunteer-mapped: strong on
shops, restaurants, clinics and workshops, weak on anything trading from an office. It is a floor on
the market, never a census. The page marks thin categories in its legend and says so in the
explainer.

**Counts move slightly between runs.** Two runs of the auto query minutes apart returned 1,025 and
1,006, because Overpass mirrors carry different OSM snapshots. Treat totals as accurate to about a
percent, not exact.

Unnamed features are counted and dropped, never drawn: a nameless building cannot be matched to a
CRM company. 1,755 shops belonging to another category are reclassified rather than double-counted.

### Four Overpass traps, each measured

- An area filter on the English-name tag matched nothing and returned **zero elements with no
  error**. An empty response is now treated as throttling and retried on another mirror, never
  accepted as an answer.
- A regex search for the boundary relation returned HTTP 504. Area ids are resolved once from
  Nominatim into `lookups/uae-emirate-areas.json` instead.
- **"Dubai" in Nominatim is the city.** The emirate had to be queried as "Dubai Emirate", which is
  what puts Hatta, Jebel Ali and Dubai South inside the boundary.
- Mapping a relation to an area works on more mirrors than referring to a prebuilt area id, which
  returns zero on two of them.

## Layout

```
lookups/    reference data, committed, reviewed before use
scripts/    Node - pull, locate, aggregate, build
data/       what the page publishes, and only what it publishes. No PII.
page/       index.src.html is the file to EDIT; index.html is generated and published
raw/        gitignored - raw pulls and any vendor token
```

`data/` holds business names, record ids, category, stage, community and coordinates. No phone
numbers, no emails, no balances, no trade-licence detail, anywhere in the repo.

## Running anything

Node 24 is installed but **not on PATH**. Every shell that runs node or npm needs this first:

```bash
export PATH="/c/Users/Mohamed/AppData/Local/Microsoft/WinGet/Packages/OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe/node-v24.19.0-win-x64:$PATH"
```

There is no Python on this machine.

| Script | What it does |
|---|---|
| `scripts/lib/communities.js` | Maps free text to a community. Run it directly for its self-test. |
| `scripts/geocode-communities.js` | Real centroids from Nominatim. Resumable. |
| `scripts/pull-osm-universe.js` | The market universe from Overpass. Resumable, one emirate per run. |
| `scripts/build-meta.js` | Builds the page's figures and cross-checks every total. |
| `scripts/build-page.js` | Assembles the published page, inlining vendor CSS. |
| `scripts/serve.js` | Serves the repo locally so the page can be checked before publishing. |

Two shell traps in this repo, both already paid for: a bash heredoc containing quotes breaks, and
**backticks inside a shell string get executed as command substitution**, which silently shredded
this file once. Write files with the Write tool, not with shell heredocs.

## Publishing constraints, all measured

The published-artifact viewer enforces a content security policy.

- **External stylesheets are blocked.** Leaflet's and Leaflet.markercluster's CSS are inlined by the
  page build, which refuses to build if any stylesheet or script would come from a blocked host.
  Google Fonts is the one allowed stylesheet host. Scripts from cdnjs are fine.
- **Leaflet's CSS references images relatively.** Once inlined those 404, so the page uses circle
  markers only and never a default marker icon.
- **CARTO Voyager is not usable, and no automatic check would have caught it.** It still serves
  tiles without an API key but stamps "API KEY REQUIRED" across every one. It fires a tile-load
  event, not a tile-error, so the fallback logic saw a healthy provider. Only looking at the
  rendered page found it. The page now uses plain OpenStreetMap, with Esri streets and Esri
  satellite as alternates, and falls through to the next provider if one is blocked.

## Community centroids are real, and the first attempt was wrong

Centroids come from OpenStreetMap through Nominatim, free, one request per second, with an
identifying User-Agent. No coordinate in this project is invented.

The first run accepted Nominatim's first result and looked fine. It was wrong: **13 of 90 results
were transport features**, not areas. Hatta resolved to a road 90 km from the town, Al Fahidi to a
shop, Al Safa to a metro station in a different district. Each would have moved a whole community's
worth of pins with no error raised.

The script now accepts only OSM place, boundary and landuse features, retries a refused name with
alternative queries, and records what it refused. **88 of 91** communities have a centroid. Al Khail
Gate, Al Thanyah and Dubai Sports City do not, and anything there stays unlocated.

## One reconciliation, worth remembering

A Dubai city-name filter returns **19,974** companies. One has city "abu dhabi / dubai" and is
excluded as ambiguous, leaving **19,973**. The lifecycle and industry breakdowns total 19,974
because they were queried before that exclusion. The build enforces this rather than trusting a
comment.

## Cost rules in force

- **No paid credits.** Not Clay, Apollo, Lusha, Apify or Google Places. Overpass and Nominatim only,
  inside their published usage policies.
- Every vendor spend is gated on an explicit yes, with the count and the estimate stated first.
- Nothing is published publicly. The page stays private and is republished to the same URL.
