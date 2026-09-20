# Start here — handoff for the next session

Read this, then `README.md`, then `PLAN.md`.

## The deliverable

**`dist/flapkap-uae-map.html`** — one file, opens by double-click, needs no network.
All seven emirates. 574 OpenStreetMap tiles are base64 inside it.

```bash
export PATH="/c/Users/Mohamed/AppData/Local/Microsoft/WinGet/Packages/OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe/node-v24.19.0-win-x64:$PATH"
node scripts/allocate-places.js      # companies -> emirate + area
node scripts/scatter-pins.js         # -> a coordinate for every one
node scripts/build-map-data-uae.js   # -> data/map-uae.json
node scripts/build-standalone-uae.js # -> dist/flapkap-uae-map.html
```

The Dubai-only chain (`build-map-data.js` + `build-standalone.js`) still works and is kept as the
source of the per-company deal and admin findings, which the UAE build reuses by company id rather
than re-deriving.

## What is on it

| | |
|---|---:|
| Companies in the pool | **36,329** |
| **Drawn** | **31,771** |
| — exact geocoded street address | 3,649 |
| — scattered inside a known area | 8,966 |
| — scattered inside a known emirate | 16,956 |
| — scattered somewhere in the UAE (emirate unknown) | 2,200 |
| Location unknown — counted, not drawn | 3,997 |
| Not UAE — dropped | 561 |
| OpenStreetMap universe | 18,018 — **Dubai only, by decision** |

Dubai 23,631 · Abu Dhabi 3,349 · Sharjah 1,532 · Ajman 483 · Ras Al Khaimah 354 ·
Fujairah 125 · Umm Al Quwain 97.

**Coverage against each source**, so the gap is not mistaken for completeness:

| | | |
|---|---:|---:|
| HubSpot companies in the portal | 47,516 | |
| …drawn on the map | 31,771 | 67% |
| …established as UAE by any evidence | 31,771 | **all drawn** |
| Admin-app clients | 8,534 | |
| …matched to a CRM company | 718 | **8.4%** |
| Funded clients | 372 | 55 Egyptian, outside a UAE map → **317 UAE** |
| …funded pins on the map | 319 | 267 admin-app-only + 52 via the CRM name join |

Closed won 469 (AED 49.9M, held by the 74 with a HubSpot deal value) · in process 742 / AED 444.2M · closed lost 427 / AED 215.8M.

## Decisions the user took, 19 Sep 2026

1. **Scatter, do not hide.** A company we know is in a place is drawn *inside that place*, flagged as
   not-exact. This **supersedes** the old "no address means not drawn" rule. What stays banned is
   inventing a *place*.
2. **UAE-wide from CRM + admin app only.** Finding businesses we do *not* already hold is parked
   outside Dubai until the CRM/admin side is finished.
3. **Contacts count.** A company with no location of its own is counted in the emirate its contacts
   name — but still never gets a street-level pin.
4. **Location evidence is emirate names, city names and UAE names. Nothing else.**
5. **IT & software is category 8.**
6. **"+971 are all UAE"** (20 Sep 2026). A company's own phone area code and a `.ae` domain count as
   location evidence, ranked above its contacts. The number is derived from once and discarded.

## Traps — connector, all silent, all measured

**These fail by returning plausible data, not errors.**

- **A WIDE query is nearly free; a NARROW one is expensive.** Over ~75 KB the result spills to a file
  and costs ~250 tokens. Under it, the rows come back inline and cost thousands. Ask for *more*
  columns on purpose.
- **The 500-row cap is hard**, even on the spill path. `LIMIT 5000` still returns 500.
- **`OFFSET` works on single-object queries** and paginates correctly.
- **`OFFSET` is IGNORED on cross-object queries.** Two pages at `OFFSET 0` and `OFFSET 500` came back
  byte-identical, same md5. Paginating that way writes the same 500 rows forever and reconciles to
  nothing. Cut cross-object pulls by `createdate` instead.
- **`ORDER BY` returns an EMPTY dataset on cross-object queries.**
- **`OR` inside a cross-object `WHERE` also returns an EMPTY dataset.** One city per query.
- **`WHERE` allows at most 20 nested conditions, and 2 association joins.**
- **Cross-object results are TSV, not JSON**, with duplicate column names — two `[hs_object_id]` and
  two `[country]`. Tell them apart by the `Contact `/`Company ` label prefix and by position.
- **`GROUP BY` is unreliable with some filters** — it returned empty against a `COUNT(*)` of 4,639.
  Always cross-check a `GROUP BY` against a direct count before trusting it.

## Traps — map and page

- **Uniform scatter over an emirate is worse, not more honest.** It drew 20,000 businesses across
  empty desert and rendered as a filled geometric shape. Emirate-level pins are spread over that
  emirate's known populated areas instead.
- **Over-fading approximate pins makes them vanish.** 20% opacity with no stroke disappeared at
  country zoom. Exact pins keep the white ring; approximate ones lose it but stay readable.
- **Draw order matters now.** 27,821 grey CRM pins bury the ~1,400 coloured deal pins unless the
  quiet layer is drawn first.
- **Size.** 26,224 pins + 8.8 MB of tiles = 15.4 MB against a **16 MB** publish limit. Repeated
  string fields are dictionary-encoded to integers and expanded on load; that alone bought 2.1 MB.
- **Do not open at the median pin.** 80% of pins are in Dubai, so the median hides six emirates. A
  fixed country `setView` is used. `fitBounds` got it wrong twice before.
- **Tile policy: max 250 tiles at z13+.** Currently 229. `fetch-tiles-uae.js --plan` prints the
  budget and refuses to run if the plan breaks it.
- Nominatim is 1 req/s. Overpass needs a real User-Agent and 9s between queries.
- **Nominatim can hand back the wrong place with the right name.** "Al Jurf, Ajman" resolved to the Al Jurf on the Abu Dhabi coast, 100 km away, and 23 Ajman pins were drawn there until 20 Sep 2026. Every approximate pin is now tested against its emirate polygon; an area anchor that fails falls back to the emirate tier. Area pins are spread as a soft cluster, not a uniform box - the box read as a literal square at street zoom.
- **Tiles: where none exists at a zoom, the page scales up the nearest coarser embedded tile** instead of showing grey. Deep tiles now cover Dubai, Abu Dhabi, Al Ain, Sharjah-Ajman, RAK, Fujairah and UAQ cores: 613 tiles, 238 at z13 (budget 250), page 14.9 MB (limit 16).
- **The website sweep crashes Node on some hosts** (an undici assertion; uncatchable). Before 20 Sep it
  retried the same host forever — 60 restarts, 20 records. It now logs each host before fetching and
  writes a host off after two crashes. Keep `raw/website-inflight.log` and `raw/website-suspects.json`.
- Inside the page's template literal, `\n` becomes a real newline. Backticks in a shell string get
  executed — use the Write tool.

## What is still open

**The map side is done.** Everything below is blocked on something other than effort.

1. **The licence pull is DONE (20 Sep 2026).** 372 `flapkap_get_client` calls in 8 fresh agents,
   ~1.5M tokens, 6 minutes. `legalAddresses` turned out to be filled on 113 of 372 (the "empty"
   finding was a three-client sample); the licence authority names the emirate on 193 more; 55
   funded clients are Egyptian and are dropped as foreign. **319 funded pins on the map, from 46.**
   `scripts/admin-licence-emirate.js` merges the pull; `lookups/admin-license-emirate.md` has the detail.
2. **The outstanding book — parked 20 Sep 2026 ("a nice idea, unnecessary right now, keep it"). When it comes back: emirate level, all seven emirates.** Built and hidden
   until `raw/admin-balances.json` exists. Blocked on **permission**: the balance endpoints were refused
   by the session's permission classifier (PII); Mohamed has to allow them. Then: 8 agents, one
   `flapkap_get_credit_balance` (or `flapkap_get_financials`, latest `openAmount`) per funded UAE client,
   write `{id, outstanding, asOf}` only, rebuild. Rows under 5 clients merge. `lookups/outstanding-book.md`.
3. **2,200 companies are UAE with no emirate** — drawn at a populated point in the country and flagged
   "UAE, emirate unknown"; 71 of them are funded clients whose licence, address, phone and website
   all failed to name an emirate. **3,997 more say nothing at all** — the "Location unknown" tile,
   not drawn, never called foreign. The website sweep is finished (7,446 domains, 31.3% hit rate);
   nothing else on these records can place them.
4. **The universe layer outside Dubai** — parked by decision 2 above. Pick this up now that the
   CRM/admin side is finished.
5. **`data/map-uae.json` is 7.0 MB** and committed. If that becomes awkward, gitignore it and rebuild.

## Two more traps, both paid for late in the session

- **Reading an artifact before republishing costs ~30K tokens.** It saves the full page to a file,
  but still returns a long head — for this page that is inlined Leaflet. Read it ONCE per session;
  after that, republish by the same `file_path` and it keeps the URL.
- **Publishing is cheap; round trips are not.** A 13 MB publish costs ~400 tokens because the file
  never passes through the conversation. The round trip carrying it costs ~300K at a large context.
  Batch publishes to milestones — the file size is irrelevant, the number of stops is everything.

## How the user wants this done

- **It must look like a real map.** This is the measure of success.
- **Never invent a place.** Scattering inside a real boundary is fine; a guessed boundary is not.
- **No paid credits.** Overpass and Nominatim only, inside their policies.
- **Every figure carries an explainer** with the formula and what would make it wrong.
- **Save what you pull; search it on disk.** Never re-query for something already in `raw/`.
- **The admin app outranks HubSpot on won and lost.** HubSpot keeps pipeline.
- Send the built file with SendUserFile after each meaningful change; republish to the same artifact
  URL. Report measured usage; stop at 90% of context.
