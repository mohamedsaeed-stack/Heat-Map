# Dubai Coverage Heat Map — build plan

Status: **decisions taken 19 Sep 2026, build not started.** Research findings are dated 19 Sep 2026.

Predecessor: `heatmap-project-brief.md` (Abu Dhabi F&B format demo, handed over from Claude chat). This plan supersedes its Abu Dhabi scope: the target is **the whole of Dubai**, all categories, one page with a category filter.

---

## 0. Decisions taken by the user, 19 Sep 2026

| Question | Decision |
|---|---|
| Vendor / GTM tools (Apify, Google Places, Clay, Apollo, Lusha) | **None.** No paid tool, no API key, no account. Claude finds the data itself. Apify may be connected "after a week or so" to complete the universe layer. |
| Revenue per area | **Yes — outstanding book** (not disbursed, not fees). |
| Retail as its own category | **Yes.** Category 7. |
| FlapKap-Admin connector | **Authorised by the user.** The session's stale connection was re-dialled 19 Sep; first call happens in the next turn / next session. |
| Universe layer if the free route is weak | User's stated fallback: ship the CRM layers first, add the universe when Apify is connected. |
| Working mode | The user opens a **new task session under this project** from the chip Claude creates; that session builds from this plan. |

---

## 1. What gets built

One published, org-internal web page: a map of Dubai with five stacked layers, a category filter, layer toggles, per-area statistics, and an explainer on every figure.

| # | Layer | Source | Unit |
|---|---|---|---|
| 1 | **Market universe** — businesses that exist in each category | **OpenStreetMap via the free Overpass API** (v1). Google Maps via Apify later, if connected. | place |
| 2 | **On the CRM** — universe businesses (and any others) that exist as HubSpot companies | HubSpot COMPANY | company |
| 3 | **In process** — companies with an open deal | HubSpot DEAL → COMPANY | company |
| 4 | **Closed lost** — lost or rejected, with reason and deal owner; two taxonomies kept apart by a type flag | HubSpot DEAL + admin-app Risk decisions | company |
| 5 | **Closed won** — funded clients | FlapKap admin app (primary) · HubSpot Money Disbursed / Signed (cross-check) | client |

Derived views, computed per grid cell and per Dubai area, shown as the actual *heat*:

- **Coverage** = CRM ÷ universe — *only for categories where the universe source is credible (see §3, obstacle 4)*
- **Acquisition** = closed won ÷ CRM
- **Outstanding book per area** — from the admin app, reconciled to the admin app's own total before it is shown

### Categories

Seven, each mapped from HubSpot's 150-value `industry` picklist using the committed `industry-map.json` from the audit repo (reused, extended):

| # | Category | Dubai CRM companies | Dubai customers (HubSpot) | OSM universe in Dubai bbox |
|---|---|---:|---:|---:|
| 1 | Hospitality & F&B | ≈2,712 | 33 | 5,435 eateries + 371 bakeries/coffee + 1,142 hotels |
| 2 | Medical clinics & healthcare | ≈1,031 | 5 | 1,217 |
| 3 | Contracting, fitouts, FFE | ≈1,387 | 9 | *not usable* |
| 4 | Marketing & advertising | ≈940 | 3 | 59 — *not usable* |
| 5 | Auto parts & automotive trading *(Karim's vertical, flagged separately)* | ≈634 | 7 | 1,123 |
| 6 | Manufacturing & general trading | ≈4,240 (after Retail split) | 19 | ≈150 — *not usable* |
| 7 | **Retail** (split out of 6) | 895 | 7 | 15,416 shops of all kinds (needs sub-type filtering) |
| — | *Blank industry* | 2,635 | 5 | — |
| — | *Other* | ≈5,500 | 18 | — |

**Category discovery, as instructed:** any category with closed clients in Dubai that is not one of the seven gets its own bucket and filter value. HubSpot's 106 Dubai customers show **IT & software** (6) and professional services (≈6) as candidates; the decisive pass runs on the admin app's ≈8,400 clients (its industry field) in W0 and adds buckets accordingly.

### Filters and controls

- Category: multi-select, default all seven (+ discovered).
- Layers: toggle each of the five independently; heat mode switches between *density*, *coverage* (where credible), *acquisition* and *outstanding book*.
- Area table: Dubai communities ranked by the chosen metric, click to zoom.
- **AE "nearby" mode:** click anywhere → the funded clients within 2 km, their category and outstanding book.
- Every figure has an `i` explainer: how derived, what would make it wrong, and the count of records that could not be located.
- Date stamp on each layer: CRM snapshot date, admin snapshot date, OSM data timestamp.

---

## 2. Architecture

```
HubSpot (SQL connector)  ─┐
FlapKap admin (read API) ─┼─►  pull scripts (Node, WinGet path) ─► data/*.json  ─┐
OpenStreetMap (Overpass) ─┘        match + geocode (Node)         ─► match table  ─┼─► published page
                                                                                     │   index.html + data files
                                   viewer's own HubSpot / admin connector ──────────►┘   (live overlay, optional)
```

**Snapshot first, live overlay second.** The page ships with data files built by the scripts, so it works for every viewer. For viewers who have the HubSpot (and FlapKap-Admin) connector in their own claude.ai, the page uses the artifact `mcp` capability to re-query lifecycle and deal stage for the known company ids with the *viewer's* credentials and recolours pins live. New companies since the snapshot show as a count, never as invented pins. A weekly scheduled routine that re-pulls and republishes the data files is the second freshness mechanism (§9).

**Data files stay separate from the page** (`data/*.json`, published alongside). The audit page proved that inlining a 150 KB dataset makes every later read of the page cost ~60K tokens.

**Rendering at scale.** The universe is aggregated into a ~500 m hex grid (h3-js from jsDelivr) and drawn as density/coverage heat. CRM, in-process, lost and won layers use clustered markers (Leaflet.markercluster). Leaflet from cdnjs, never unpkg (blocked, proven by the demo).

**Tooling.** Node 24 at the WinGet path (not on PATH) — all pulls, matching and aggregation run as Node scripts under `scripts/`. No Python. Overpass needs a real `User-Agent` header (a bare request gets HTTP 406 — measured).

---

## 3. Obstacles found, and the solution for each

| # | Obstacle | Evidence | Solution |
|---|---|---|---|
| 1 | **The session's admin connection was stale.** Every call returned "connection invalidated" even after the user re-authorised. | 6 calls, 19 Sep | The connector was toggled off/on for this session, which re-dials it with the fresh grant when the turn ends. New sessions dial fresh. If a call still fails in a new session, the fix is on the connector page in claude.ai, not on the FlapKap login page. |
| 2 | **Map tiles may not load inside a published artifact.** Artifact pages restrict external resources; the demo showed tiles blocked in one sandbox. | brief; artifact design contract | **Spike first (W0):** publish a 2 KB private test page that loads one OSM tile. If it renders, proceed. If not, the deliverable becomes a standalone HTML file in Google Drive (proven to work) and the live overlay is dropped from v1. |
| 3 | **73 % of Dubai CRM companies have no street address.** 19,974 Dubai companies; only 5,335 have `address`. | HubSpot, 19 Sep | Four-tier locating, cheapest first: (a) **community extraction from address and name text** ("Al Quoz", "Deira", "Business Bay"… ) — places a company at community level with no geocoding at all, enough for the area table and community heat; (b) **name-match to the OSM universe** (free; it *is* the join); (c) **Nominatim** (free, 1 req/s) on the 5,335 street addresses; (d) for the still-unlocated **customers and open deals only**, Claude looks the business up in the built-in browser one at a time, **capped at ~50 businesses** (≈4–6K tokens each). Everything else is **counted but not pinned**; each layer shows its unlocated count. No coordinates are ever invented. Contact addresses (HubSpot CONTACT.address) are tested as a fallback for companies without one. |
| 4 | **The universe cannot be scraped from Google Maps by Claude driving a browser.** Arithmetic: Google Maps lists ~20 results per load and caps a query near 120; Dubai needs 1,500–3,000 category × area queries; each costs 40–80K tokens of browser reads → **60–240 M tokens**, plus CAPTCHAs (which Claude will not bypass) and Google's terms. Background agents spend from the same account, so they do not change the arithmetic. | measured page costs; tool rules | **OpenStreetMap via Overpass** as the v1 universe: free, licensed (ODbL), structured JSON with coordinates, names and `osm_id`, pulled by one Node script at ~zero tokens per record. **Measured in the Dubai bounding box:** 5,435 eateries, 1,142 hotels, 1,217 medical, 1,123 automotive, 15,416 shops — **credible for F&B, medical, auto and retail**, an undercount of perhaps 40–60 % against reality. **Not credible for contracting (no count returned), marketing (59) and manufacturing/trading (≈150)** — for those three the coverage view is switched off and the page says why. Apify/Google Maps replaces or supplements this later without changing the architecture: the join key is a generic `source_id` (`osm:…` now, `google:…` later). |
| 5 | **No shared key across Maps, HubSpot and the admin app.** "Rain Café" / "Rain Cafe LLC" / "RAIN - UAE". | brief | Committed **match table** (`data/match.json`: HubSpot company id ↔ source_id ↔ admin client id, with score and method). Normalise names (case, punctuation, legal suffixes LLC/FZE/FZ-LLC/Trading/Est), token-set similarity, same-community constraint when known; accept ≥ 0.85, sample-review 0.70–0.85, reject below. The admin app's legal name and HubSpot's trade name are both stored. Writing the id back into HubSpot is a later, separate decision (custom property + write access). |
| 6 | **Deal stages are a minefield.** Five pipelines; `closedwon` is labelled "Offer Sent" and `closedlost` "Signed"; "Signed", "Unworthy", "Totally Lost", "Offer Sent" each exist under 3–4 stage ids; two loss taxonomies. | pipeline × stage matrix, 19 Sep | Commit an explicit **stage → layer map** (`lookups/stage-map.json`) before any deal is counted, one line per (pipeline, stage id). Live pipeline: *Canopy Deal Pipeline* (977 Meeting Booked, 151 Money Disbursed, 517 Closed Lost, 209 Rejected by Risk). Legacy: *UAE Pipeline (default)* (351 Totally Lost, 417 Unworthy, 90 "Signed"). Loss layer carries `type: sales_lost | risk_rejected`. The user reviews the map before it is used. |
| 7 | **Industry is blank on 2,635 Dubai companies (13 %) and several picklist values are ambiguous.** | HubSpot; `industry-map.json` `_ambiguous` | Reuse the audit's map, add Retail. *Blank* is its own filter value, never hidden. Ambiguous placements listed in the method explainer. OSM categories are mapped to the same seven buckets with the mapping shown. |
| 8 | **"Live" updates from a static page.** | — | Snapshot files + `mcp` live overlay with the viewer's connectors (§2); weekly scheduled re-pull as v2. |
| 9 | **Admin-app pull cost is unknown.** MCP responses come back inline (no spill-to-file like HubSpot); ≈8,400 clients at 100 per page could cost 5–10K tokens a page → 400–800K if pulled naïvely. | tool shape | W0 probes one page and measures. If large: pull only what the map needs (Dubai, funded/active, and the few fields listed in §6) via the narrowest endpoint available — `flapkap_get_stats`, offers by status, or search-filtered lists — and persist immediately. The estimate in §5 carries this as a stated range. |
| 10 | **Freshness decays silently.** | brief | Date stamp on every layer; OSM data timestamp shown; refresh procedure in `README.md`. |
| 11 | **Licensing.** | — | OSM data is ODbL — attribution on the page, fine for internal and shared use. Google-sourced data, if Apify is connected later, is internal-only and flagged before wider sharing. |
| 12 | **HubSpot query traps** — 500-row silent cap, cross-object fan-out, GROUP BY undercount with association filters, `LIKE` broken on phone fields. | audit repo | Partitioned pulls sized to spill to file (450–480 rows), dedupe on `hs_object_id`, separate `COUNT(*)` per value, verify every "Showing X of Y" line. |

The demo's stat card (256 CRM leads) does not reconcile with its own table (Lead 228 + MQL 16 = 244). None of the demo's numbers are reused.

---

## 4. Build waves

Each wave ends at a safe point: results on disk, committed, a short report, and a measured usage percentage.

| Wave | Deliverable | Depends on |
|---|---|---|
| **W0 — Spikes & scaffold** | Tile test artifact. Admin-app probe: location key, industry field, outstanding-book field, one-page token cost. `.gitignore`, `README.md`, `lookups/` seeded from the audit repo. | admin connector |
| **W1 — CRM layers, Dubai** | Partitioned pull of all Dubai companies in the seven categories (≈13K) and all deals in the UAE pipelines; committed `stage-map.json`; layers 2–4 built; community extraction + Nominatim locating; **first publishable page** with density heat, category filter, explainers, unlocated counts. | W0 |
| **W2 — Closed won & outstanding book** | Funded clients from the admin app as primary, matched to HubSpot; closed-won layer; outstanding book per community and per hex, reconciled to the admin total; Risk-rejection loss layer; category discovery from admin industry. | W0 probe |
| **W3 — Universe (OSM)** | Overpass pull for Dubai (admin boundary, not bbox), seven categories mapped to OSM tags; `osm_id` stored; hex density; CRM ↔ OSM name match; coverage heat **for F&B, medical, auto, retail only**. | W1 |
| **W4 — High-value locating** | Browser lookups for still-unlocated customers/open deals, capped at ~50. | W2 |
| **W5 — Live overlay + AE nearby mode** | `mcp` capability refresh of stages for known ids; "new since snapshot"; nearby-clients panel. | W1 published |
| **W6 — Handoff** | `README.md` refresh procedure, `START-HERE.md` for a fresh session, all lookups committed. | — |

W1 alone is a usable AE tool (every Dubai open deal and lost deal on a map, plus HubSpot customers as a cross-check) and needs nothing from any vendor.

---

## 5. Estimated cost

### Tokens

| Wave | Estimate | Main driver |
|---|---:|---|
| W0 | 15–20K | two spikes, admin probe, repo scaffold |
| W1 | 70–85K | ~35 partitioned pulls (≈600 tokens each, data spills to file) · locating scripts · first page (~60–80 KB HTML/JS) · design skills (~20K) |
| W2 | 30–60K | **range depends on the W0 admin probe** (obstacle 9) · match to HubSpot · outstanding-book reconciliation |
| W3 | 20–30K | Overpass script, tag mapping, hex aggregation, match QA samples |
| W4 | 25–35K | ~50 browser lookups × 4–6K, hard cap |
| W5 | 15–20K | capability code, one real-call shape check |
| W6 | 10K | docs, handoff |
| **Total** | **≈185–260K tokens** | 2–3 sessions, split at wave boundaries, no session past ~300K context |

**Without the universe (W3) and browser lookups (W4):** ≈140–195K.

No conversion to a percentage of the usage window — that rate degrades as a session grows and was wrong the last time it was quoted. Measured percentage is reported at every wave boundary. At the time of writing: 5-hour window **33 %**, weekly **33 %**, this session's context **17 %** of 1M.

### Money

**$0.** No vendor, no API key, no account. OSM and Nominatim are free public services used within their usage policies (User-Agent set, 1 request/second for Nominatim).

---

## 6. Repo layout

```
heatmap/
  PLAN.md                    this file
  README.md                  what it is, how to refresh, dates of last pulls
  heatmap-project-brief.md   predecessor brief (history)
  abudhabi_fb_heatmap.html   format demo (history, not a source of numbers)
  lookups/
    industry-map.json        from the audit repo, + Retail bucket, + OSM tag mapping
    stage-map.json           (pipeline, stage id) → layer, reviewed before use
    dubai-city-variants.txt  the 18 spellings that mean Dubai
    dubai-communities.json   community names + aliases for text extraction
  scripts/                   Node — pull, match, geocode, aggregate, build data files
  data/                      built data files published beside the page (no PII)
  raw/                       gitignored — raw pulls
  page/
    index.html               the map
```

`data/` holds only what the page shows: business names, categories, coordinates, ids, stages, outstanding book per area. **From the admin app only:** company name, legal name, address/community, industry, status, outstanding balance, funded date. No Emirates IDs, no personal names of merchants, no phone numbers, no emails, anywhere in the repo.

---

## 7. What the page will show — and what it will not

**Shown, and defensible**

- Every Dubai open deal, lost deal and funded client that can be located, with a click-through to its HubSpot / admin record by id.
- Where FlapKap's **outstanding book is concentrated** by community — which is also an *exposure* view; Risk will read it that way, and that is a feature.
- Loss reasons and deal owners per area, sales-lost and Risk-rejected kept apart.
- For F&B, medical, automotive and retail: **coverage against OSM-mapped businesses**, labelled as a share of *mapped* businesses, not of the market.

**Not shown, or shown with a warning**

- Coverage for contracting, marketing and manufacturing/trading — the free universe is too thin; the page says so rather than showing a misleading ratio.
- Any company that could not be located — it is counted in the layer total and in the unlocated count, never placed at a guessed point.

## 8. What the user is risking

| Risk | Where it bites | Mitigation |
|---|---|---|
| **Coverage read as market share.** OSM undercounts reality by perhaps 40–60 % even in its good categories, so "we cover 30 %" may really be 15 %. | Management view | Label every coverage figure "of OSM-mapped businesses"; explainer states the undercount; swap in Google Maps data later and the numbers move down, which should be said up front. |
| **A thin CRM layer on the map.** Realistic located share for the broad CRM layer is 35–50 % (community-level placement lifts it further for the area table). Someone will read a sparse area as "no leads there". | Coverage / density views | Unlocated count on every layer and in every area row; density heat computed on *located* companies only, said explicitly. |
| **Deal-stage misclassification.** One wrong line in the stage map and "Signed" deals become losses. | Layers 3–5 | The stage map is committed and reviewed by the user before any figure is computed; the closed-won layer is cross-checked against the admin app's funded list. |
| **Outstanding book that does not reconcile** to the admin app's own total. | Revenue view | Reconciliation figure printed in the explainer; if it does not match, the view ships disabled. |
| **Name-match false positives** placing a CRM company on a different business with a similar name. | All located layers | 85 % threshold, same-community constraint, sample review logged in the repo; the user accepted a 15 % miss rate for this audience. |
| **Staff names on lost deals.** | Internal sensitivity | Org-internal page (the `mcp` grant bars public sharing); owners shown by name only on the lost layer, which can be toggled off. |
| **Freshness.** A three-month-old snapshot presented as current. | Trust | Dates in the header; weekly re-pull routine (§9). |
| **Token spend on the admin pull** if the API only offers full pages. | Budget | Measured in W0 before any full pull; stated range in §5. |

## 9. Further suggestions

1. **Community-level placement from text** (obstacle 3a) — the cheapest lift to the located share; the area table and community heat work without a single geocode.
2. **Contact addresses as a fallback** — many companies without an address have contacts with one; a two-query probe settles whether this is worth a tier.
3. **Weekly scheduled routine** to re-pull HubSpot and republish the data files, instead of relying only on the viewer-side live overlay. Cheap, and it keeps the date stamp honest without anyone remembering.
4. **Write the join key back into HubSpot** (custom property `heatmap_source_id`) once the match table is reviewed — makes the join permanent and lets HubSpot reports use it. Needs write access; a separate decision.
5. **AE nearby mode** (§1) — the brief's AE use case, and the most likely thing an AE actually opens before a meeting.
6. **Calibrate the OSM undercount** against Dubai's published business-licence statistics by activity and area (Dubai Pulse / DET open data), if accessible — turns "share of mapped businesses" into an estimated true-market share with a stated method. To be verified in W3; not promised.
7. **Share the outstanding-book view with Risk** — same data, second audience, no extra work.
8. **Keep the model city-agnostic** so Abu Dhabi (and the demo's numbers, done properly) and Sharjah are a config change, not a rebuild.
