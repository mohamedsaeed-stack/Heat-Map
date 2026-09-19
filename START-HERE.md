# Start here — handoff for the next session

Read this, then `README.md`, then `PLAN.md`.

## The deliverable

**`dist/flapkap-dubai-map.html`** — one file, opens by double-click, needs no server and **no network**.

```bash
node scripts/build-map-data.js && node scripts/build-standalone.js
```

**The map tiles are inside the file.** 284 OpenStreetMap tiles for the Dubai core, zoom 10 to 13,
base64 in the html. This was not gold-plating: the user opened the file twice in viewers that block
external images, the app's file preview and the published-artifact viewer, and both times saw pins
floating on grey. Embedded tiles cannot be blocked. A `L.TileLayer` subclass reads the embedded tile
first and the network second, with `maxNativeZoom: 13` so deeper zooms scale the embedded tiles
rather than requesting new ones.

This stays inside the OpenStreetMap tile policy: 204 tiles at z13, under the 250 limit, one city,
one snapshot. Do not widen the box without re-reading that policy.

## What is on it

| | |
|---|---:|
| Companies pulled | 18,866 |
| **Pinned** | **3,705** and rising |
| — geocoded street address | 2,991 |
| — matched by name to OpenStreetMap | 474 |
| — on an area centroid | 240 |
| — counted, cannot be placed | 15,161 |
| Deals | 1,501 |
| OpenStreetMap businesses (universe layer) | 18,018 |
| Closed won | 220 · AED 49.9M |
| In process | 742 · AED 444.2M |
| Closed lost | 438 · AED 215.8M |

Every pin carries the business name, category, stage, deal value, owner, close date and loss reason.
Every stat card has an **`i` button** giving what it counts, the formula, why it is done that way,
and what would make it wrong.

## Precedence, decided by the user

**The admin app outranks HubSpot on closed won and closed lost.** HubSpot keeps pipeline.

```
financingStatus REFINANCING      -> closed won
status LOST_IN_ACQUISITION       -> closed lost
status POST_ANALYSIS_REJECTION   -> closed lost, Risk
status AUTO_REJECTION            -> closed lost, auto
status CLOSED                    -> closed lost
```

209 companies reclassified. **The two systems disagree on 169 records**, every popup shows both
readings, and 13 sit in open HubSpot pipeline for merchants the admin app has already lost.

## Locating: every route, and where each one stops

This is the question the user pressed hardest on. All four free routes are implemented.

| Route | Yield | Ceiling |
|---|---:|---|
| Street address → Nominatim | 2,991 | Only ~25% of companies hold an address, and 41% of those resolve |
| Business name → OpenStreetMap place | 474 | 16,429 companies have no OSM place of that name |
| Business name → Nominatim free-text | running | ~3% hit rate; most Dubai SMEs are not mapped |
| Address text → area centroid | 240 | Marks the area, not the building |

**Contacts were checked and do not help.** 35,062 contacts carry a city and a company link, but
**only 53 in the entire CRM carry a street address**. Contacts can confirm a company is in the UAE;
they cannot place one on a map. Measured, not assumed.

**Generic addresses are refused.** 173 say only "Dubai" or "UAE", which geocodes to the city centre.
An early build stacked 383 unrelated companies on one point that way, and it reads as a real cluster.

What would raise the ceiling, none of it free: a paid geocoder, Google Places, or writing a
`place_id` back into both systems so the join stops depending on names.

## Traps already paid for — do not rediscover these

- **This HubSpot connector is not the one the old notes describe.** A record SELECT returns 25 rows
  by default, caps at **500**, and writes large results to a file instead of the conversation. That
  file is the cheap path: a 480-row partition costs ~200 tokens to request and nothing to receive.
- **Truncation at 500 is silent.** Every partition needs an expected `COUNT(*)` and the totals must
  reconcile before the data is trusted.
- **`GROUP BY` with an association filter is unreliable.** Grouping deal-linked companies by
  lifecycle stage summed to ~47,000 against a `COUNT(*)` of 2,969.
- **Cross-object deal queries return TSV, not JSON**, and two columns are both `hs_object_id`.
- **Partition from exact daily counts** (`lookups/dubai-createdate-buckets.json`). 2026-01-14 alone
  holds 468 records.
- **Nominatim free-text almost always returns something.** Without a guard it hands back the centre
  of Dubai for any unknown business. `scripts/geocode-by-name.js` only accepts a result whose first
  display-name component shares a distinctive word with the company.
- **Nominatim's first result is often not the place.** Hatta resolved to a road 90 km away.
- **CARTO Voyager stamps "API KEY REQUIRED" across every tile** while firing a normal tile-load
  event, so no automatic check catches it.
- **Marker clustering made the map stop looking like a map.** It replaces the coloured dots with
  numbered bubbles. Every pin is drawn individually now; clustering is an opt-in checkbox.
- **`fitBounds` got the opening view wrong twice**, once landing on the whole world and once on a
  single street. It reads the container size at call time. A fixed `setView` on the median pin is
  used instead.
- **Inside the page's template literal, `\n` becomes a real newline** and breaks the emitted JS
  string; a raw apostrophe in sample SQL closes it. Escape both.
- **Backticks inside a shell string get executed.** Use the Write tool for files.
- **Nominatim is one request per second.** No faster free route exists.

## What is still open

1. **UAE beyond Dubai.** Boundaries for all seven emirates are in `lookups/uae-emirate-areas.json`,
   so the universe extends with one flag. The CRM side needs city spellings and an area list per
   emirate, and the embedded tile set would need extending per city.
2. **318 of 372 funded clients cannot be placed.** The admin app holds no city and no street address
   on the client summary; its only location is `legalAddresses` on the per-client endpoint, one API
   call each. The name join to HubSpot matches 8.4%, which measures the broken link between the
   systems rather than a defect in the matcher.
3. **The outstanding book.** Needs `flapkap_get_credit_balance` per client. Aggregate by area before
   drawing anything.
4. **IT & software as category 8.** The admin app's `IT_SOFTWARE_DATA` holds 180 clients.
5. **The two NOP stages.** `pre_nop_rejection_reason` options are all credit criteria, so Rejected
   Pre NOP is a Risk rejection. Still worth a sentence from whoever owns the Canopy pipeline.

## How the user wants this done

- **It must look like a real map**, at city zoom, with named businesses and coloured pins. This was
  said many times and it is the measure of success.
- **Ship the standalone file**, with the tiles inside it.
- **Never invent data.** A record with no usable address is counted and not drawn.
- **No paid credits.** Overpass and Nominatim only.
- **Every figure carries an explainer** with the formula.
- Report measured usage percentages. Stop at 90% of the context window.
