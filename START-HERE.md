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
| Companies | **29,365** |
| **Drawn** | **27,384** |
| — exact geocoded street address | 3,649 |
| — scattered inside a known area | 7,543 |
| — scattered inside a known emirate | 16,192 |
| Counted, not drawn (UAE, no emirate) | 1,364 |
| Not UAE | 617 |
| OpenStreetMap universe | 18,018 — **Dubai only, by decision** |

Dubai 21,886 · Abu Dhabi 3,112 · Sharjah 1,436 · Ajman 442 · Ras Al Khaimah 323 ·
Fujairah 103 · Umm Al Quwain 82.

**Coverage against each source**, so the gap is not mistaken for completeness:

| | | |
|---|---:|---:|
| HubSpot companies in the portal | 47,516 | |
| …drawn on the map | 27,384 | 58% |
| …of the 28,675 established as UAE | 27,384 | **95%** |
| Admin-app clients | 8,534 | |
| …matched to a CRM company | 718 | **8.4%** |
| Funded clients | 372 | |
| …drawn on the map | 46 | **12%** |

Closed won 220 / AED 49.9M · in process 742 / AED 444.2M · closed lost 438 / AED 215.8M.

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
- Inside the page's template literal, `\n` becomes a real newline. Backticks in a shell string get
  executed — use the Write tool.

## What is still open

**The map side is done.** Everything below is blocked on something other than effort.

1. **THE ONE THING WORTH DOING NEXT: pull `legalAddresses` per admin client.** One call each for
   372 funded clients. It gives funded clients a location of their OWN and stops the map depending
   on the 8.4% name join — taking funded clients on the map from 46 toward 372, and unblocking the
   outstanding book as a side effect. The same ~372 calls that would buy balances buy *locations*
   instead, which is the thing actually missing.
   **Blocked as of the end of this session: the FlapKap-Admin connector dropped out of the session
   and is no longer listed.** It needs re-enabling before this can run.
2. **The outstanding book is BLOCKED, and not by tokens.** See `lookups/outstanding-book.md`.
   Only 48 of 372 funded clients can be placed at all, and they sit in 4 areas with 1–2 clients
   each — so an area-level book would expose individual balances. Fixed by item 1, not by
   more API calls. **Ask the user before spending anything here.**
3. **1,364 companies are UAE with no emirate. This route is EXHAUSTED** — only 28 of them have a
   contact carrying any city, and most of those are genuinely ambiguous (contacts in both Dubai and
   Abu Dhabi). They really do say only "UAE". Do not spend more here.
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
