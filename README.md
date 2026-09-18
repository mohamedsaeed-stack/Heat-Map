# Dubai Coverage Heat Map

A map of Dubai showing where businesses exist, which of them are on the CRM, which are in process,
which were lost and which are funded clients — filtered by category, with an explainer on every
figure.

Owner: Mohamed Saeed, RevOps. Agreed as a side project with Amr Ibrahim, Head of RevOps.

- `PLAN.md` — the approved plan. Layers, categories, architecture, the twelve known obstacles, wave
  order, cost. Read it before changing anything here.
- `heatmap-project-brief.md` — the predecessor brief, kept as history. **Its Abu Dhabi demo numbers
  are not reused**; the 256-lead stat card there does not reconcile with its own table.
- `abudhabi_fb_heatmap.html` — the format demo, kept as history. Its lead pins are invented
  coordinates and were never data.

## Layout

```
lookups/    reference data, committed, reviewed before use
scripts/    Node - pull, locate, aggregate, build data files
data/       what the page publishes. No PII.
page/       the map itself
raw/        gitignored - raw pulls and any vendor token
```

`data/` holds business names, record ids, category, stage, community and coordinates. No phone
numbers, no emails, no balances, no trade-licence detail — not anywhere in the repo.

## Running anything

Node 24 is installed but **not on PATH**. Every shell that runs `node` or `npm` needs this first:

```bash
export PATH="/c/Users/Mohamed/AppData/Local/Microsoft/WinGet/Packages/OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe/node-v24.19.0-win-x64:$PATH"
```

There is no Python on this machine. Everything is Node or PowerShell.

| Script | What it does |
|---|---|
| `scripts/lib/communities.js` | Maps free text to a Dubai community. Run it directly for its self-test. |
| `scripts/geocode-communities.js` | Fetches a real centroid per community from Nominatim. Resumable. |

## W0 findings

### Tiles in a published Artifact — spike

Spike page: https://claude.ai/artifact/JQNGKJaEbmNqKR3rL3d1uu — Leaflet from cdnjs, one
OpenStreetMap layer, no data. It counts `tileload` and `tileerror` events and prints a verdict, so
the answer does not depend on judging a grey rectangle by eye.

**Result: awaiting the user's confirmation.** Recorded here once they report back.

**What the spike already proved, before anyone opened it:** the Artifact viewer's content security
policy **blocks external stylesheets**. The first publish returned a warning that the Leaflet
stylesheet from cdnjs would be blocked in viewers' browsers. Scripts from cdnjs are allowed; CSS is
not.

Consequences for the real page, all of them now design constraints:

- **Inline every stylesheet.** Leaflet's CSS is 10.9 KB; Leaflet.markercluster's is smaller. Both go
  inline. Only Google Fonts links may stay external.
- **Leaflet's CSS references four images relatively** (`images/marker-icon.png`, `layers.png`,
  `layers-2x.png`, plus a VML behaviour). Once the CSS is inlined those paths resolve against the
  artifact origin and 404. Use `L.circleMarker` and `L.divIcon` so no marker image is ever
  requested, and avoid the default layers control.

### Admin-app probe

**Not run.** See `lookups/admin-fields.md`. The `FlapKap-Admin` connector exposes no tools in this
session — `flapkap_auth_status` and the rest are simply absent, so there was nothing to call. Every
claude.ai connector on the account reports `pending`, HubSpot included, which points at a
session-level connector problem rather than the invalidated OAuth grant recorded in PLAN.md
obstacle 1.

## Refresh cadence

Not yet set. PLAN.md obstacle 10: the map decays silently as businesses close, so every layer
carries the date its data was pulled, and the page header carries the universe pull date.

## Cost rules in force

- **No paid credits.** Not Clay, Apollo, Lusha, Apify, Google Places, or anything billing per
  record. Overpass and Nominatim are free and are used within their published policies — Nominatim
  at one request per second with an identifying User-Agent.
- Every vendor spend is gated on an explicit yes, with the count and the estimate stated first.
