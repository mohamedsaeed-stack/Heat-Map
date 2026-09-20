# FlapKap UAE Coverage Map

A map of where FlapKap's merchants are across **all seven emirates** — who is on the CRM, who has a
live deal, who was lost, and who is funded — filtered by emirate, category and how precisely each pin
is known, with an explainer on every figure.

**Live page: https://claude.ai/artifact/PYQb7axx5DtTWS8kYV47sv** — private, republished to the same
URL on every change. Never make it public.

Owner: Mohamed Saeed, RevOps. Agreed as a side project with Amr Ibrahim, Head of RevOps.

- `START-HERE.md` — **read this first.** What is done, what is blocked, every trap.
- `PLAN.md` — the original approved plan. Scope has moved on; START-HERE is authoritative.
- `lookups/outstanding-book.md` — why the revenue view is blocked, measured.
- `lookups/stale-deals.md` — 19 deals open in HubSpot that the admin app has already closed.
- `lookups/data-quality-findings.md` — **the findings log**: every measured data problem, for the CRM
  owner to fix and the Head of RevOps to review. Mohamed will ask for it at the end; keep appending.
- `heatmap-project-brief.md` — the predecessor brief, kept as history. **Its Abu Dhabi demo numbers
  are not reused**; that demo's lead pins were invented coordinates.

## The deliverable

**`dist/flapkap-uae-map.html`** — one file, opens by double-click, **needs no network**. 574
OpenStreetMap tiles are base64 inside it, because the artifact viewer and the app's file preview both
block external images and the map would otherwise be pins floating on grey.

```bash
export PATH="/c/Users/Mohamed/AppData/Local/Microsoft/WinGet/Packages/OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe/node-v24.19.0-win-x64:$PATH"
node scripts/allocate-places.js       # company -> emirate + area, by evidence
node scripts/scatter-pins.js          # -> one coordinate per company
node scripts/build-map-data-uae.js    # -> data/map-uae.json
node scripts/build-standalone-uae.js  # -> dist/flapkap-uae-map.html
```

## What is on it

| | Companies |
|---|---:|
| Companies in the pool | **36,329** |
| **Drawn** | **31,771** |
| — exact, geocoded street address | 3,649 |
| — scattered inside a known area | 8,966 |
| — scattered inside a known emirate | 16,956 |
| — scattered somewhere in the UAE, emirate unknown | 2,200 |
| Location unknown — counted on the page, not drawn | 3,997 |
| Not UAE — dropped | 561 |

Dubai 23,631 · Abu Dhabi 3,349 · Sharjah 1,532 · Ajman 483 · Ras Al Khaimah 354 ·
Fujairah 125 · Umm Al Quwain 97.

Closed won 469 (AED 49.9M, held by the 74 with a HubSpot deal value) · in process 742 / AED 444.2M · closed lost 427 / AED 215.8M.

## How a company gets onto the map

Evidence is taken in strict precedence, and the **first** field that names a place wins:

```
1 the company's own city          22,549
2 its own state / region             254
3 its own address text               294   includes the admin app's legal address, for funded clients
4 its own name                       238   refused if its country says elsewhere
5 the admin app's trade licence      109   funded clients: DET-Dubai, EDD-Sharjah, ADDED, DMCC...
6 the address on its own website   4,270   the only route that regularly yields an AREA
7 its own phone area code            213   +9714 Dubai · +9712 Abu Dhabi · +9717 RAK · +9719 Fujairah
8 a +9715 mobile or a .ae domain     766   proves the UAE only, never which emirate
9 a contact's city                 1,645   counts the emirate, never a street pin
   its country alone               1,433   proves UAE only, never which emirate
```

Emirate names, city names and UAE names count as location — and, since 20 Sep 2026 ("+971 are all UAE"),
the company's own phone area code and a `.ae` domain. The phone number is read once, turned into an
emirate and discarded; it exists nowhere in `raw/`, `data/` or the page. Nothing else is evidence.

**Nothing could place 3,997 companies.** They carry no city, country, region, address or postcode, their
website (if any) names no place, and no contact helps. They are **unknown, not foreign**: the page counts
them in the "Location unknown" tile and does not draw them. The 561 that name another country are dropped.

**The name route has a guard that earns its keep.** The sweep returned companies called "219 Dubai",
"UAE Clearing" and "HZ UAE" whose own country field says India, Czechia and the United States. The
name evidence is refused whenever the record's own country says somewhere else.

## Approximate pins — the rule, and why

**A company we know is in a place is drawn inside that place, flagged as not-exact.** This replaced
the earlier "no address means not drawn", which left 80% of the CRM invisible.

What stays banned is **inventing a place**. Scattering inside a real, measured boundary is honest —
the company genuinely is somewhere in that polygon — as long as the page never implies the point is
the building. So:

- a **solid dot with a white ring** is a real geocoded street address;
- a **softer, ringless pin** is scattered inside a known area or emirate;
- the popup says which, and names the place;
- a **"how exact is the pin?"** filter switches the approximate ones off entirely;
- the scatter is **seeded from each company's own id**, so pins never move between rebuilds;
- every point is tested against the **real polygon**, never a bounding box — a Dubai box puts pins in
  the Gulf and a Fujairah box puts them inside Oman.

**Uniform scatter was tried first and is worse, not more honest.** Spread evenly, 20,000 businesses
landed across empty desert and the emirate rendered as a filled geometric shape — which also implies
something false. Emirate-level pins are now spread across that emirate's known populated areas. The
claim is still only "in this emirate", and the page says so.

## Funded clients: the admin app has its own location now

The admin app is the authority on who is funded, and until 20 Sep 2026 only 46 of its 372 funded clients
reached the map, through a name join to HubSpot that finds 8.4%. One `flapkap_get_client` call per client
(372 calls, eight fresh agents, ~1.5M tokens, six minutes) fixed that:

- **`legalAddresses` is filled on 113 of 372** — real street addresses naming an area. The old "always
  empty" claim came from a three-client sample.
- **The licence authority names the emirate** on 193 more: `636960 DET-Dubai`, `741566 EDD-Sharjah`,
  `DMCC-34280 DMCC-Dubai`. The table is in `scripts/admin-licence-emirate.js`.
- **55 funded clients are Egyptian** (country EGY, +20 phones). This is a UAE map; they are counted and
  left off, like any other foreign record. The UAE funded book is **317**.
- **319 funded pins** are on the map: 267 exist only in the admin app and are drawn from their own
  address or licence, 52 reach it through the CRM join (2 of those joins point at Egyptian clients — a
  name-match data-quality item). Precision: 14 exact, 111 area, 123 emirate, 71 UAE-only.
- Admin-only pins carry **no deal value, owner or stage** — HubSpot has no record of them. The popup says
  "per the admin app" and shows the last disbursement date instead of a close date. The AED figure on the
  closed-won tile covers only the 74 funded clients with a HubSpot deal value, and the explainer says so.
- Privacy: the pull saw bank details and owner emails; **none were written anywhere**. The raw part files
  hold ten location fields per client and nothing else, and the legal address text never leaves `raw/`.

## The universe layer: Dubai only, by decision

18,018 real businesses from OpenStreetMap, inside the Dubai emirate boundary. **The other six
emirates deliberately show only what we already hold in the CRM and admin app** — finding businesses
we do *not* have is parked until the CRM/admin side is finished.

OpenStreetMap is volunteer-mapped: strong on shops, restaurants, clinics and workshops, weak on
anything trading from an office. It is a floor on the market, never a census. **87% of our own CRM
companies do not exist on OpenStreetMap at all**, which is the measurement of that.

## Categories

Eight, mapped from HubSpot's industry picklist via `lookups/industry-map.json`:
Hospitality & F&B · Medical & healthcare · Contracting/fitouts/FFE · Marketing & advertising ·
Auto & automotive · Manufacturing & general trading · Retail · **IT & software**.

IT & software was added 19 Sep 2026 on evidence: 180 admin-app clients under `IT_SOFTWARE_DATA` and
2,919 CRM companies carrying an IT industry value — a bigger bucket than Retail. All were in "Other".

## Running anything

Node 24 is installed but **not on PATH** — every shell needs the export above. There is no Python.

| Script | What it does |
|---|---|
| `parse-spill.js` | Reads HubSpot's spilled JSON result files off disk. |
| `parse-crossobject.js` | Same for cross-object results, which are TSV with duplicate columns. |
| `allocate-places.js` | Company → emirate + area, by the precedence above. |
| `geocode-uae-places.js` | Emirate polygons and area centroids from Nominatim. Resumable. |
| `geocode-uae-addresses.js` | Street addresses → points. Refuses generic ones. Resumable. |
| `scatter-pins.js` | One coordinate per company, deterministic, inside the real shape. |
| `recover-unlocated.js` | The 8,040 no-location companies: emirate from the phone area code, UAE from a `.ae` domain. Discards the number. |
| `locate-by-website.js` | Reads the address off each company's own website. Resumable; isolates hosts that crash Node. `sweep-until-done.sh` restarts it until done. |
| `admin-licence-emirate.js` | Funded admin-app clients → emirate, from the licence authority, legal address, phone area code or website. Reads `raw/admin-licence-part-*.json`. |
| `fetch-tiles-uae.js` | Embedded tiles. `--plan` prints the budget and enforces OSM policy. |
| `serve.js` | Serves the repo locally so the page can be checked before publishing. |

## Cost and licensing rules in force

- **No paid credits.** Not Clay, Apollo, Lusha, Apify or Google Places. Overpass and Nominatim only,
  inside their published policies — 1 request/second, identifying User-Agent.
- **Tile policy: no more than 250 tiles at zoom 13 or deeper.** Currently 229. The fetcher refuses to
  run if a plan breaks it.
- OpenStreetMap data is ODbL — attributed on the page, fine for internal use.
- **Everything pulled is saved to `raw/` and searched on disk.** Never re-query for something already
  held; that is what kept 91 HubSpot queries down to ~55K tokens.
- `data/` and the page hold business names, ids, category, stage, emirate, area and coordinates.
  **No phone numbers, no emails, no balances, no trade-licence detail, anywhere.**
