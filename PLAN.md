# Dubai Coverage Heat Map — build plan

Status: **awaiting the user's OK.** Nothing below has been built. Research findings are dated 19 Sep 2026.

Predecessor: `heatmap-project-brief.md` (Abu Dhabi F&B format demo, handed over from Claude chat). This plan supersedes its Abu Dhabi scope: the target is **the whole of Dubai**, all categories, one page with a category filter.

---

## 1. What gets built

One published, org-internal web page: a map of Dubai with five stacked layers, a category filter, layer toggles, per-area statistics, and an explainer on every figure.

| # | Layer | Source | Unit |
|---|---|---|---|
| 1 | **Market universe** — businesses that exist in each category | Google Maps (via Apify) | place |
| 2 | **On the CRM** — universe businesses (and any others) that exist as HubSpot companies | HubSpot COMPANY | company |
| 3 | **In process** — companies with an open deal | HubSpot DEAL → COMPANY | company |
| 4 | **Closed lost** — lost or rejected, with reason and deal owner; two taxonomies kept apart by a type flag | HubSpot DEAL (+ admin-app Risk decisions when reconnected) | company |
| 5 | **Closed won** — funded clients | FlapKap admin app (primary) · HubSpot Money Disbursed / Signed (fallback until admin reconnects) | client |

Derived views, computed per grid cell and per Dubai area, shown as the actual *heat*:

- **Coverage** = CRM ÷ universe
- **Acquisition** = closed won ÷ CRM
- **Revenue per area** — once the admin-app join exists (metric to be chosen, see §7)

### Categories

The six ICPs, each mapped from HubSpot's 150-value `industry` picklist using the committed `industry-map.json` from the audit repo (reused, not rebuilt):

| Category | Dubai CRM companies | Dubai customers (HubSpot) |
|---|---:|---:|
| Hospitality & F&B | ≈2,712 | 33 |
| Medical clinics & healthcare | ≈1,031 | 5 |
| Contracting, fitouts, FFE | ≈1,387 | 9 |
| Marketing & advertising | ≈940 | 3 |
| Auto parts & automotive trading *(Karim's vertical, flagged separately)* | ≈634 | 7 |
| Manufacturing & general trading | ≈5,135 | 26 |
| *Blank industry* | 2,635 | 5 |
| *Other* | ≈5,500 | 18 |

**Category discovery, as instructed:** any category that has closed clients in Dubai but is not one of the six gets its own bucket and its own filter value. From HubSpot's 106 Dubai customers the candidates are already visible:

- **Retail** — 7 customers, 895 Dubai CRM companies. Currently folded into "general trading"; the audit's own map flagged it as the largest contested value. → **Proposed as category 7.**
- **IT & software** — 6 customers (IT services 4, software 2). → Proposed as category 8 if the admin app confirms volume.
- Professional services (consulting, HR, staffing, research) — ≈6 customers. → Held in *Other* unless the admin app shows more.

The admin app holds ≈8,400 clients against HubSpot's 106 Dubai customers, so the **real** discovery pass runs on the admin app's industry field the moment the connector is re-authorised (§3, obstacle 1). The list above is the fallback, not the answer.

### Filters and controls

- Category: multi-select, default all six (+ discovered).
- Layers: toggle each of the five independently; heat mode switches between *density*, *coverage* and *acquisition*.
- Area table: Dubai communities ranked by the chosen metric, click to zoom.
- Every figure has an `i` explainer: how derived, what would make it wrong, and the count of records that could not be located.
- Date stamp on each layer: CRM snapshot date, universe pull date.

---

## 2. Architecture

```
HubSpot (SQL connector)  ─┐
FlapKap admin (read API) ─┼─►  pull scripts (Node, WinGet path) ─► data/*.json  ─┐
Apify Google Maps run    ─┘        match + geocode (Node)         ─► match table  ─┼─► published page
                                                                                     │   index.html + data files
                                   viewer's own HubSpot / admin connector ──────────►┘   (live overlay, optional)
```

**Snapshot first, live overlay second.** The page ships with data files built by the scripts, so it works for every viewer. For viewers who have the HubSpot (and later FlapKap-Admin) connector in their own claude.ai, the page uses the artifact `mcp` capability to re-query lifecycle stage and deal stage for the known company ids with the *viewer's* credentials, and recolours pins live. New companies created since the snapshot show as a count ("N new since snapshot"), never as invented pins. This is how "updates directly from the CRM" is met without a backend holding credentials.

**Data files stay separate from the page** (`data/*.json`, published alongside). The audit page proved that inlining a 150 KB dataset makes every later read of the page cost ~60K tokens.

**Rendering at scale.** The universe will be tens of thousands of points; it is aggregated into a ~500 m hex grid (h3-js from jsDelivr) and drawn as density/coverage heat. CRM, in-process, lost and won layers are small enough for clustered markers (Leaflet.markercluster). Leaflet from cdnjs, never unpkg (blocked, proven by the demo).

**Tooling.** Node 24 is installed at the WinGet path (not on PATH) — all pulls, matching and aggregation run as Node scripts committed under `scripts/`. No Python.

---

## 3. Obstacles found, and the solution for each

| # | Obstacle | Evidence | Solution |
|---|---|---|---|
| 1 | **FlapKap-Admin connector is invalidated.** Every call returns "connection invalidated — reconnect from connector settings". The session lists it as connected; the OAuth grant behind it is dead. | 3 calls, 19 Sep | **User action:** claude.ai → Settings → Connectors → FlapKap-Admin → Reconnect / re-authorise (this is separate from the FlapKap login page). Until then, closed-won and category discovery run on HubSpot as a stated fallback, and the admin sections are designed against the brief's assumptions. |
| 2 | **Map tiles may not load inside a published artifact.** Artifact pages restrict external resources; the demo already showed tiles blocked in one sandbox. | brief §Technical findings; artifact design contract | **Spike first (W0):** publish a 2 KB private test page that loads one OSM tile. If it renders, proceed. If not, the deliverable becomes a standalone HTML file in Google Drive (proven to work in any browser) and the live overlay is dropped from v1. |
| 3 | **73 % of Dubai CRM companies have no street address.** 19,974 Dubai companies; only 5,335 have `address`. Most hold `city` alone. | HubSpot, 19 Sep | Three-tier locating, in this order: (a) **name-match to the scraped universe** — free, and it *is* the join; (b) **Nominatim** (free OSM geocoder, 1 req/s) on the 5,335 street addresses; (c) **Google Places Text Search** for the still-unlocated *high-value* records only (customers, open deals, MQLs ≈ 1,600) — within the 5,000 free Pro calls per month, so $0 if kept under that. Anything still unlocated is **counted but not pinned**, and every layer shows its unlocated count. No coordinates are ever invented. |
| 4 | **The universe needs a scraping account and a budget I cannot create.** Creating accounts or entering payment details is off-limits for me. | — | User creates an Apify account (free plan covers ~1K places for a test run; Starter $49/mo for the real pull) and drops the API token in a gitignored `.env`. I write and run the scripts. **Every run is gated on your yes**, with the place count and estimated spend stated first. |
| 5 | **No shared key across Maps, HubSpot and the admin app.** "Rain Café" / "Rain Cafe LLC" / "RAIN - UAE". | brief §Open cautions | Store Google `place_id` in a committed **match table** (`data/match.json`: HubSpot company id ↔ place_id ↔ admin client id, with match score and method). Normalise names (case, punctuation, legal suffixes LLC/FZE/FZ-LLC/Trading/Est), token-set similarity, same-city constraint; accept ≥ 0.85, review 0.70–0.85 by sample, reject below. Writing `place_id` back into HubSpot is a later, separate decision — it needs a custom property and write access. |
| 6 | **Deal stages are a minefield.** Five pipelines; `closedwon` is labelled "Offer Sent" and `closedlost` "Signed"; "Signed", "Unworthy", "Totally Lost" and "Offer Sent" each exist under 3–4 different stage ids; two loss taxonomies (sales-lost vs rejected-by-Risk). | HubSpot pipeline × stage matrix, 19 Sep | Commit an explicit **stage → layer map** (`lookups/stage-map.json`) before any deal is counted, one line per (pipeline, stage id). The live pipeline is *Canopy Deal Pipeline* (977 Meeting Booked, 151 Money Disbursed, 517 Closed Lost, 209 Rejected by Risk); *UAE Pipeline (default)* is legacy (351 Totally Lost, 417 Unworthy, 90 "Signed"). Loss layer carries `type: sales_lost | risk_rejected`. You review the map before it is used. |
| 7 | **Industry is blank on 2,635 Dubai companies (13 %) and several picklist values are ambiguous** (Retail, Apparel, Design, Leisure…). | HubSpot; `industry-map.json` `_ambiguous` list | Reuse the audit's map. *Blank* is its own filter value, never hidden. Ambiguous placements are listed in the page's method explainer. The Maps universe uses Google's category, so coverage ratios are computed per category on *both* sides with the mapping shown. |
| 8 | **"Live" updates from a static page.** A published page cannot hold HubSpot or admin credentials. | — | Snapshot data files + `mcp` live overlay using the viewer's own connectors (§2). Viewers without the connectors see the snapshot with its date. A scheduled weekly re-pull that republishes the data files is a v2 option. |
| 9 | **Scale.** A Dubai-wide universe across eight categories is likely 40–60K places. | estimate | Hex-grid aggregation for the universe; clustered markers for the CRM layers; data in separate files; page never loads more than the visible layers. |
| 10 | **Freshness decays silently** (UAE F&B turnover). | brief | Date stamp on every layer, universe pull date in the header, refresh cadence recorded in `README.md`. |
| 11 | **Scraping terms of service.** Internal use of scraped Maps data is one position; a shared artifact is another. | brief | The page is org-internal by construction (the `mcp` grant bars public sharing). Google-sourced fields shown are name, category, address, coordinates; no reviews, photos or phone numbers are stored. Flagged for you to clear before it is shown outside RevOps. |
| 12 | **HubSpot query traps** — 500-row silent cap, cross-object fan-out, GROUP BY undercount with association filters, `LIKE` broken on phone fields. | audit repo, proven | Partitioned pulls sized to spill to file (450–480 rows each), dedupe on `hs_object_id`, separate `COUNT(*)` per value, verify every "Showing X of Y" line. |

The demo's stat card (256 CRM leads) does not reconcile with its own table (Lead 228 + MQL 16 = 244). None of the demo's numbers are reused.

---

## 4. Build waves and gates

Each wave ends at a safe point: results on disk, committed, a short report, and a measured usage percentage. **Gates marked £ involve vendor spend and wait for an explicit yes.**

| Wave | Deliverable | Depends on | Gate |
|---|---|---|---|
| **W0 — Spikes** | Tile test artifact (obstacle 2). Admin-app field probe: location key and industry field (obstacles 1, §7 Q1/Q3). `git init`, `.gitignore`, `README.md`. | admin re-auth for the probe | — |
| **W1 — CRM layers, Dubai** | Partitioned pull of all Dubai companies in the six ICPs + Retail + IT (≈13K) and all deals in the two UAE pipelines; committed `stage-map.json`; layers 2–5 built from HubSpot; located via Nominatim on the 5,335 addresses; **first publishable page** with heat = CRM density, category filter, explainers. | W0 | — |
| **W2 — Universe** | Apify Google Maps pull for Dubai, eight categories, in a **1K-place test run first**, then the full pull; `place_id` stored; hex-grid density; name-match of CRM to universe; coverage heat. | Apify account + token | **£** test run · **£** full run |
| **W3 — High-value locating** | Google Places Text Search for still-unlocated customers / open deals / MQLs, kept inside the free tier. | GCP project with Places API enabled (user) | **£** only if it would exceed the free 5,000/month |
| **W4 — Admin-app join** | Closed won from the admin app as primary; category discovery on admin industry; Risk-rejection loss layer; revenue per area (metric per §7). | admin re-auth · answers to §7 | — |
| **W5 — Live overlay** | `mcp` capability: viewer-credential refresh of lifecycle/deal stage for known ids; "new since snapshot" count. | W1 published | — |
| **W6 — Handoff** | `README.md` refresh procedure, `START-HERE.md` for a fresh session, all lookups committed. | — | — |

W1 alone is a usable AE tool (every Dubai customer, open deal and lost deal on a map) and needs no vendor spend and no admin connector.

---

## 5. Estimated cost

### Tokens (my work)

Estimated against the audit project's measured costs: the audit page build consumed one full 430K-context session; this build has more data but the pull pattern (spill-to-file) is now known and Node replaces PowerShell for aggregation.

| Wave | Estimate | Main driver |
|---|---:|---|
| W0 | 15K | two spikes, repo setup |
| W1 | 70–85K | ~35 partitioned pulls (each ~600 tokens overhead, data spills to file) · match/geocode scripts · first page (~60–80 KB HTML/JS written) · design skills loaded (~20K) |
| W2 | 30–40K | Apify scripts, monitoring, hex aggregation, match QA samples |
| W3 | 10–15K | one script, one review |
| W4 | 30–40K | admin-app pulls (unknown pagination cost — sized after the probe) and the join |
| W5 | 15–20K | capability code, one real-call shape check |
| W6 | 10K | docs and handoff |
| **Total** | **≈180–225K tokens** | across 2–3 sessions, split at wave boundaries so no session grows past ~300K context |

What I will **not** do is convert this to a percentage of your usage window: that rate degrades as a session grows and the last time it was quoted it was wrong. I will report the measured percentage at every gate instead. Right now: 5-hour window **24 %** (resets in ~40 min), weekly **32 %**, this session's context **10 %** of 1M.

### Money (vendors — every item gated on your yes)

| Item | Estimate | Note |
|---|---:|---|
| Apify Google Maps Scraper, ~40–60K Dubai places | **$160–240** at ~$3.90/1K places, + Starter plan $49/mo while pulling | Free plan covers a ~1K-place test run at no cost. Cheaper actor variants exist ($1.5–2.1/1K) with unverified quality. |
| Google Places Text Search, targeted ≈1,600 lookups | **$0** if kept under the 5,000 free Pro calls/month | Needs a GCP project with billing enabled (card on file — yours to set up, not mine). $32/1K beyond the free tier. |
| Nominatim geocoding | $0 | 1 req/s policy → 5,335 addresses ≈ 90 min unattended. |
| Clay / Apollo / Lusha | $0 planned | Not needed for v1; would only be proposed, with credit cost stated, if the universe match rate disappoints. |

Sources for vendor pricing: [Apify Google Maps Scraper](https://apify.com/compass/crawler-google-places), [Apify pay-per-event note](https://help.apify.com/en/articles/10774732-google-maps-scraper-is-going-to-pay-per-event-pricing), [Apify pricing breakdown 2026](https://gmapsscraper.io/blog/apify-google-maps-scraper-pricing-review), [Google Places API pricing 2026](https://www.safegraph.com/guides/google-places-api-pricing/), [Places free-tier limits 2026](https://www.mapsleads.co/blog/google-places-api-free-tier-limits-2026), [Places pricing per SKU](https://openplacesapi.com/blog/google-places-api-pricing).

---

## 6. Repo layout (to be created in W0)

```
heatmap/
  PLAN.md                    this file
  README.md                  what it is, how to refresh, dates of last pulls
  heatmap-project-brief.md   predecessor brief (kept as history)
  abudhabi_fb_heatmap.html   format demo (kept as history, not a source of numbers)
  lookups/
    industry-map.json        copied from the audit repo, extended with Retail / IT
    stage-map.json           (pipeline, stage id) → layer, reviewed before use
    dubai-city-variants.txt  the 18 spellings that mean Dubai
  scripts/                   Node — pull, match, geocode, aggregate, build data files
  data/                      built data files published beside the page (no PII)
  raw/                       gitignored — raw pulls, .env with vendor tokens
  page/
    index.html               the map
```

`raw/` is gitignored because vendor tokens and raw scrapes live there. `data/` holds only what the page shows: business names, categories, coordinates, ids, stages. No phone numbers or emails anywhere in the repo.

---

## 7. Decisions I need from you (none block W0–W1)

1. **Apify account** — will you create it and hand me the token via `raw/.env`, or should the universe wait? (blocks W2)
2. **Revenue per area metric** — disbursed amount, fees earned, or outstanding book? Three different maps. (blocks the revenue view in W4)
3. **Retail as category 7** — confirm, or keep it inside general trading. IT & software as 8 — confirm after the admin probe.
4. **Re-authorise FlapKap-Admin** in claude.ai Connectors (blocks the W0 probe and W4).

Everything else in this plan is decided by the brief or by your instructions today; where I have chosen, the choice and the reason are written above.
