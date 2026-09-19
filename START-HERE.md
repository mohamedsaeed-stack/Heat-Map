# Start here — handoff for the next session

Read this, then `README.md`, then `PLAN.md`.

## The deliverable

**`dist/flapkap-dubai-map.html`** — one file, opens by double-click, no server.

**Build it with:** `node scripts/build-map-data.js && node scripts/build-standalone.js`

This is the thing that matters. The published artifact at
https://claude.ai/artifact/PYQb7axx5DtTWS8kYV47sv is a secondary view and **its map tiles are
blocked by the artifact viewer's content security policy**, so it renders as an empty canvas. That
is why the Abu Dhabi demo looked like a real map and a published page does not: the demo was a local
file. Ship the local file.

## What is on it

| | |
|---|---:|
| Pinned businesses | **3,245** |
| — at a geocoded street address | 2,991 |
| — on an area centroid | 254 |
| Companies on the CRM | 18,866 |
| Deals | 1,501 |
| OpenStreetMap businesses | 18,018 |
| Closed won | 220 · AED 49.9M |
| In process | 742 · AED 444.2M |
| Closed lost | 438 · AED 215.8M |
| Counted but not drawn | 15,621 (no usable address) |

Every pin carries the business name, category, stage, **deal value**, **owner**, close date and loss
reason. Names can be shown on the map itself, pins can be sized by deal value, and there is a search
box. Three basemaps: streets, detailed, satellite.

## Precedence, decided by the user

**The admin app outranks HubSpot on closed won and closed lost.** HubSpot keeps pipeline.

```
financingStatus REFINANCING      -> closed won
status LOST_IN_ACQUISITION       -> closed lost
status POST_ANALYSIS_REJECTION   -> closed lost, Risk
status AUTO_REJECTION            -> closed lost, auto
status CLOSED                    -> closed lost
```

This reclassified 209 companies. **The two systems disagree on 169 records**, and every popup shows
both readings. 13 of them sit in open pipeline in HubSpot for merchants the admin app has already
lost.

## Traps already paid for — do not rediscover these

- **This HubSpot connector is not the one the old notes describe.** A record SELECT returns 25 rows
  by default, caps at **500**, and writes large results to a file rather than the conversation. That
  file is the cheap path: a 480-row partition costs ~200 tokens to request and nothing to receive.
- **Truncation at 500 is silent.** Every partition needs an expected count from a separate
  `COUNT(*)`, and the totals must reconcile before the data is trusted.
- **`GROUP BY` with an association filter is unreliable.** Grouping deal-linked companies by
  lifecycle stage summed to ~47,000 against a `COUNT(*)` of 2,969. Trust the direct count.
- **Cross-object deal queries return TSV, not JSON records**, and two columns are both
  `hs_object_id` — one deal, one company, separable only by their label prefix.
- **Partition from exact daily counts** (`lookups/dubai-createdate-buckets.json`). Bulk-import days
  break any even split: 2026-01-14 alone holds 468 records.
- **Generic addresses must be refused.** "Dubai" or "UAE" geocodes to the city centre and stacked
  383 unrelated companies on one point before it was caught. 173 refused.
- **Nominatim's first result is often not the place.** Hatta resolved to a road 90 km away, Al
  Fahidi to a shop. Only OSM place, boundary and landuse features are accepted.
- **CARTO Voyager stamps "API KEY REQUIRED" across every tile** while firing a normal tile-load
  event, so no automatic check catches it. Only looking at the page does.
- **Leaflet must be given a sized container before `fitBounds`**, or it fits the world.
- **Backticks inside a shell string get executed.** Use the Write tool for files.
- **Nominatim is one request per second.** 2,389 addresses is 44 minutes. There is no faster free
  route, and paid geocoders are excluded.

## What is still open

1. **UAE beyond Dubai.** The universe extends with one flag per emirate — boundaries for all seven
   are in `lookups/uae-emirate-areas.json`. The CRM side needs city spellings and an area list per
   emirate.
2. **318 of 372 funded clients cannot be placed.** The admin app holds no city and no street
   address on the client summary; its only location is `legalAddresses` on the per-client endpoint,
   which is one API call each. The name join to HubSpot matches only 8.4%, which measures the broken
   link between the systems rather than a defect in the matcher.
3. **The outstanding book.** Needs `flapkap_get_credit_balance` per client. Aggregate by area before
   drawing anything — balances are the most sensitive field in the system.
4. **IT & software as category 8.** The admin app's `IT_SOFTWARE_DATA` holds 180 clients, which
   settles the question PLAN.md left open.
5. **Geocoding ceiling.** 41% of Dubai addresses resolve in OpenStreetMap. Raising that means a paid
   geocoder, which is excluded, or matching CRM records to the OSM universe by name.

## How the user wants this done

- **It must look like a real map.** Street-level basemap, named businesses, coloured pins. This was
  said more than once and it is the measure of success.
- **Ship the standalone file.** A published page cannot show tiles.
- **Never invent data.** The predecessor demo shipped placeholder pins; that must not happen again.
  A record with no usable address is counted and not drawn.
- **No paid credits.** No Clay, Apollo, Lusha, Apify or Google Places. Overpass and Nominatim only.
- **Every figure carries an explainer**: how derived, what would make it wrong, what is unlocated.
- Check usage before expensive steps and report measured percentages. Stop at 90% of the window.
