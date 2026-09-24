# FlapKap UAE Coverage Map

A map of where FlapKap's merchants are across **all seven emirates** — who is on the CRM, who has a
live deal, who was lost, and who is funded — filtered by emirate, category and how precisely each pin
is known, with an explainer on every figure.

**Live page: https://claude.ai/artifact/PYQb7axx5DtTWS8kYV47sv** — private, republished to the same
URL on every change. Never make it public.

Owner: Mohamed Saeed, RevOps. Agreed as a side project with Amr Ibrahim, Head of RevOps.

- `START-HERE.md` — **read this first.** What is done, what is blocked, every trap.
- `DEPLOY.md` — hosting the page on Railway, and the password it must go behind first.
- `PLAN.md` — the original approved plan. Scope has moved on; START-HERE is authoritative.
- `lookups/outstanding-book.md` — why the revenue view is blocked, measured.
- `lookups/stale-deals.md` — 19 deals open in HubSpot that the admin app has already closed.
- `lookups/data-quality-findings.md` — **the findings log**: every measured data problem, for the CRM
  owner to fix and the Head of RevOps to review. Mohamed will ask for it at the end; keep appending.
- `heatmap-project-brief.md` — the predecessor brief, kept as history. **Its Abu Dhabi demo numbers
  are not reused**; that demo's lead pins were invented coordinates.

## The deliverable

**`dist/flapkap-uae-map.html`** — one file, 11.7 MB, opens by double-click, **needs no network**. 596
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
| **Drawn** | **33,406** |
| — exact geocoded street address | 3,649 |
| — inside a named area | 8,907 |
| — inside a named emirate | 16,602 |
| — UAE, emirate unknown | 2,196 |
| Duplicate pins merged away (same company, same place) | 417 |
| Location unknown — counted on the page, not drawn | 2,772 |
| Dropped as foreign | 561 |
| **Market universe (OpenStreetMap), all seven emirates** | **39,370** |

Dubai 23,267 · Abu Dhabi 3,316 · Sharjah 1,525 · Ajman 477 · Ras Al Khaimah 353 ·
Fujairah 124 · Umm Al Quwain 96.

Closed won 468 (AED 88.7M, held by the 129 with a HubSpot deal value) · in process 1,253 / AED 727.3M · closed lost 711 / AED 350.5M.

## How a company gets onto the map

Evidence is taken in strict precedence, and the **first** field that names a place wins:

```
1 the company's own city          26,082
2 its own state / region             302
3 its own address text               307   includes the admin app's legal address, for funded clients
4 its own name                       212   refused if its country says elsewhere
5 the admin app's trade licence      107   funded clients: DET-Dubai, EDD-Sharjah, ADDED, DMCC...
6 the address on its own website   3,160   the only route that regularly yields an AREA
7 its own phone area code            200   +9714 Dubai · +9712 Abu Dhabi · +9717 RAK · +9719 Fujairah
8 a +9715 mobile or a .ae domain      18   proves the UAE only, never which emirate
9 a contact's city                 1,448   counts the emirate, never a street pin
   its country alone               2,256   proves UAE only, never which emirate
```

Emirate names, city names and UAE names count as location — and, since 20 Sep 2026 ("+971 are all UAE"),
the company's own phone area code and a `.ae` domain. The phone number is read once, turned into an
emirate and discarded; it exists nowhere in `raw/`, `data/` or the page. Nothing else is evidence.

**Nothing could place 2,772 companies.** They carry no city, country, region, address or postcode, their
website (if any) names no place, and no contact helps. They are **unknown, not foreign**: the page counts
them in the "Location unknown" tile and does not draw them. The 3,572 that name another country are dropped.

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

## The CRM refresh of 24 Sep 2026

On 24 Sep the team loaded street addresses, cities and countries into HubSpot. **16,989 company records
changed** since the 20 Sep snapshot (the portal grew from 47,516 to 48,106; 591 companies are new). The records with
no location field at all fell from **8,040 to 3,699**, and the ones with no country from 8,187 to 3,721.

**How it was pulled, and why this way.** A *single-object* query honours `ORDER BY` and `OFFSET` (the cross-object
traps in START-HERE do not apply), so the changed set was paged 500 at a time, ascending by id for the first
10,000 (HubSpot's hard window) and descending from the other end for the rest - 34 wide queries, every one
spilled to disk, reconciled against the `COUNT(*)`. `scripts/parse-company-delta.js` folds the pages into
`raw/hubspot-companies-delta.json`; `allocate-places.js` lays that delta over the pool, replacing the five
location fields outright (a field the delta lacks was cleared in the CRM) and adding companies the pool never held.

**What it did to the map.** Drawn companies 31,354 → **33,406**. Location unknown 3,997 → **2,772**.
9,198 companies the pool had never seen were added, of which 5,797 are in the UAE and drawn and 3,036 name another
country and are dropped. 145 pins moved to the emirate their record now names (Ajman Medical Centre left Dubai for
Ajman). The funded-client join now searches the whole pool, not the Dubai set: **74 funded clients sit on their CRM
company** (was 52) and 243 remain admin-app-only pins.

**Two rules the load forced.**

1. *A road is not a building.* 873 of the 1,288 geocoded addresses had resolved to a road ("Sheikh Zayed Road",
   "Marasi Drive", "شارع الشيخ زايد"), and 462 companies sat stacked on one Sheikh Zayed Road point looking like a
   real cluster. A geocode whose class is `highway` is now drawn as **area only**: inside the record's named area if
   it has one, otherwise spread ~1.3 km around the road point. That is why "exact" fell from 3,649 to **989** -
   the count is now honest. "Street 2" / "شارع 4" with no area is refused as generic, like an emirate name alone.
2. *A record that disagrees with itself is placed by its city only.* **1,171 records** say a UAE city but carry
   a US ZIP code (94043 is Google's) or a foreign state (California). The UAE has no postal codes; these are an
   enrichment tool's HQ address. The city stands, the address is ignored, the popup says so (findings F1).

**To refresh again** (after the next CRM edit wave): `COUNT(*)` companies with `hs_lastmodifieddate >= <last pull>`, page
them as above into spilled files, then

```
node scripts/parse-company-delta.js <spillDir> <firstSpillEpochMs> <count>
node scripts/match-admin-clients.js && node scripts/allocate-places.js
node scripts/geocode-uae-addresses.js        # resumable, ~1.1 s per new address
node scripts/scatter-pins.js && node scripts/build-map-data-uae.js && node scripts/build-standalone-uae.js
```

A second delta merges over the first: keep the newer file as `raw/hubspot-companies-delta.json` and re-run, or
concatenate them (later record per id wins) before the allocator.

## Won and lost: both systems, every pin (24 Sep 2026 audit)

An audit on 24 Sep found three gaps, all fixed the same day:

- **The Dubai build's deal verdicts were stale.** Its own pull held 1,501 of the 4,274 deals, and the UAE build copied
  its layers without re-checking. Every HubSpot pin is now judged against the all-deals pull first: **761 pins changed
  layer** - mostly plain CRM records that in fact carry an open deal (the pipeline tile went from AED 459M to AED 727.3M) or a lost one.
- **The admin app ruled on won but not on lost outside Dubai.** A client the admin app rejected, lost in acquisition or
  closed, and never funded, is closed lost whatever HubSpot says; HubSpot's layer stays as the side note. Applied to **236 pins**.
- **The money tiles showed Dubai-only amounts** next to UAE-wide counts. They now read the UAE-wide sums.

Also: a foreign (Egyptian) funded client whose name matches a UAE CRM company is no longer stamped onto that pin (8 kept apart).
Closed won = **317 funded per the admin app + 151 won in HubSpot only** (Money Disbursed or lifecycle "customer" with no admin record
saying funded). Whether those 151 are real wins is a decision for the CRM owner (findings B8, B9).

## Deals for every emirate

Until 24 Sep 2026 the pipeline and lost layers came from the Dubai build alone. All **4,274 deals** in the
portal are now pulled (`parse-deal-spills-all.js`, fourteen createdate chunks each under the 500-row cap,
reconciled to the COUNT), and every pin the Dubai build never saw is classified with the same approved
stage map. Deals by the emirate of their company: Dubai 2,232 · Abu Dhabi 204 · Sharjah 98 · Ajman 32 ·
RAK 17 · Fujairah 7 · UAQ 3 · emirate unknown 30. **1,120 deals have no company attached at all** and 531
attach to companies that are foreign or unplaceable. The pipeline is genuinely Dubai-concentrated: only 41
pins outside the Dubai build carry a deal. 1,234 deals sit in the legacy "UAE Pipeline (default)" whose
stages are outside the approved map and stay unclassified, as decided on 19 Sep.

## The universe layer: all seven emirates

39,370 real businesses from OpenStreetMap, inside each emirate boundary: Dubai 18,018 · Abu Dhabi 9,179 · Sharjah 7,038 · Ajman 3,702 · Ras Al Khaimah 456 · Fujairah 550 · Umm Al Quwain 427.
Pulled 18-23 Sep 2026 with `pull-osm-universe.js`, seven category queries per emirate. Each place carries
its emirate, so the emirate dropdown filters the universe too.

OpenStreetMap is volunteer-mapped: strong on shops, restaurants, clinics and workshops, weak on anything
trading from an office. It is a floor on the market, never a census. Measured 23 Sep 2026, CRM records per
100 visible businesses: retail 7 · hospitality 31 · auto 38 · medical 60 — but contracting 153,
manufacturing 462 and marketing 1,996, which says OpenStreetMap barely sees those categories. By emirate:
Ajman 13 · Sharjah 23 · Fujairah 23 · Umm Al Quwain 23 · Abu Dhabi 36 · Ras Al Khaimah 77 · Dubai 129.

**Known gap:** marketing agencies in Umm Al Quwain returned zero elements on every mirror; most likely there are none tagged. Re-run `pull-osm-universe.js --emirate "<name>"`; only the missing
category is fetched, the rest is cached.

## One pin per company

Mohamed, 23 Sep 2026: no duplicate pins. The same company can sit in HubSpot twice, or once in HubSpot and
once in the admin app. Records with the same name (legal suffixes and punctuation ignored) in the same
emirate are one company; copies in the same area, or with no area, merge into the best-located copy, which
takes the most advanced stage (won > lost > in process > on the CRM; the admin app wins), the deal fields
and both source links. Two street addresses in one area are **branches** and stay separate. Measured:
417 pins merged across 314 companies, 11 of them HubSpot + admin-app copies of one merchant.
Company names that are job titles (Chief Executive Officer x12, CEO x6) are left alone and logged as a
CRM finding.

## The controls

Emirate, pin precision, category, HubSpot owner and admin-app commercial owner ("Closed by", funded clients only; 198 of 372 have one) are dropdowns — "All" or one value. The street map is the only base
map. The view is locked to the UAE: it cannot pan away, and the shallowest zoom is the one that fits the
country to the screen. Every popup links to the HubSpot record and, where the company exists in the admin
app, to its client page there.

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
| `count-osm-universe.js` | One Overpass count per emirate, no download: how big the universe would be before pulling it. |
| `admin-licence-emirate.js` | Funded admin-app clients → emirate, from the licence authority, legal address, phone area code or website. Reads `raw/admin-licence-part-*.json`. |
| `fetch-tiles-uae.js` | Embedded tiles. `--plan` prints the budget and enforces OSM policy. |
| `serve.js` | Serves the repo locally so the page can be checked before publishing. |

## Cost and licensing rules in force

- **No paid credits.** Not Clay, Apollo, Lusha, Apify or Google Places. Overpass and Nominatim only,
  inside their published policies — 1 request/second, identifying User-Agent.
- **Tile policy: no more than 250 tiles at zoom 13 or deeper.** Currently 238. The fetcher refuses to
  run if a plan breaks it.
- OpenStreetMap data is ODbL — attributed on the page, fine for internal use.
- **Everything pulled is saved to `raw/` and searched on disk.** Never re-query for something already
  held; that is what kept 91 HubSpot queries down to ~55K tokens.
- `data/` and the page hold business names, ids, category, stage, emirate, area and coordinates.
  **No phone numbers, no emails, no balances, no trade-licence detail, anywhere.**
