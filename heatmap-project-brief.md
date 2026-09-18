# FlapKap Coverage Heat Map — Project Brief

Handoff document. Everything decided so far, the demo that was built, what is real versus placeholder, and what remains open.

Owner: Mohamed Saeed · RevOps / GTM Engineering
Agreed as a side project with Amr Ibrahim (Head of RevOps)
Last updated: September 2026

---

## What this is

A geographic view of FlapKap's market coverage — where businesses exist, which ones are in the CRM, which became deals, which closed, and how much revenue came from each area.

**Core question it answers:** how much of each market do we actually cover?

Nothing else in the current stack answers this. HubSpot reports on records; nobody can say what share of the addressable market those records represent, or where the white space is.

---

## Audience — decided

**Not primarily for SDRs.**

| Audience | Use |
|---|---|
| **Management** | Visibility — where coverage is thin, where revenue concentrates, where to point the team |
| **AEs** | Fast context during closing conversations — who we have funded nearby, what they borrowed |

This decision matters because it lowers the accuracy bar. Nobody is basing a cold call on a pin, so a 15% matching failure rate is acceptable.

---

## Layers requested

All layers, per industry, per city:

1. **Google Maps universe** — every business in the addressable market
2. **On the CRM** — which of those exist as records
3. **In process** — open deals
4. **Closed won** — funded clients
5. **Closed lost** — with loss reason, and the person who managed the deal
6. **Revenue per city**
7. **Acquisition rate per city** — closed ÷ CRM ÷ market

Industries: the six ICPs — hospitality & F&B, medical clinics, contracting/fitouts/FFE, marketing & advertising, auto parts & automotive, manufacturing & general trading.

**Karim's automotive vertical stays in.** Flagged as a separate channel motion, not removed.

---

## Source of truth — decided

**The FlapKap admin app is primary** for anything involving money or actual clients. HubSpot is primary for pipeline.

Why this matters: HubSpot shows 127 deals at Money Disbursed and 239 contacts at Customer stage, against roughly 8,419 clients in the admin app. The only link between the two systems is a hand-typed field on the Deal object, missing on around 17% of deals.

Treating the app as primary sidesteps that broken join rather than trying to reconcile it.

Read access to the admin app is available (read scope, session-based).

---

## Decisions already made

| Question | Decision |
|---|---|
| Matching accuracy target | **85% is acceptable.** Losing 15% is fine — do not over-engineer the join |
| Name matching | Basic normalisation is enough — capitalisation, legal suffixes |
| Live / real-time updating | **Later.** Not needed for v1 |
| Revenue per city | **In.** Management visibility, cheap to add |
| Closed lost with reasons | **In.** Worth knowing whether we lost businesses in an area and why, including who managed it |
| Automotive | **Stays in**, flagged separately |
| Audience | Management + AEs, not SDRs |

---

## Tools under consideration

Suggested by the team so far:

- **Apify** — recommended for Maps scraping at scale. Mature actors, handles pagination and rate limits, clean exports
- **Clay** — orchestration layer, already owned
- **Instant Data Scraper** — fine for a quick manual pull, not a repeatable pipeline
- **D7** — same caveat, weaker data quality

**Worth considering:** Google Places API directly. Costs more per record than scraping but it is licensed, stable, and returns a `place_id` — a permanent unique identifier per business. Storing `place_id` on each record gives you the join key that currently does not exist.

---

## The demo that was built

A single-file HTML map of **Abu Dhabi, Hospitality & F&B**, built to test the format before committing to a full build.

**File:** `abudhabi_fb_heatmap.html` — Leaflet + OpenStreetMap, no API key, no account, opens in any browser.

### Live CRM figures behind it

Pulled from HubSpot: companies in Abu Dhabi across `FOOD_PRODUCTION`, `RESTAURANTS`, `HOSPITALITY`, `FOOD_BEVERAGES`.

| Lifecycle stage | Count |
|---|---:|
| Lead | 228 |
| Marketing Qualified Lead | 16 |
| Opportunity | 12 |
| **Customer** | **2** |
| Does Not Fit ICP | 14 |
| **Total** | **272** |

Conversion CRM → customer: **0.7%**. The steepest drop is Lead → MQL, where 93% fall away.

### What is real in the demo

**Only the two closed customers and their branches.** Located by web search:

| Business | Branches | Note |
|---|---|---|
| **Rain Café** | Muroor Road (HQ), Yas Mall | Closed Sep 2026 |
| **Marmellata Bakery** | Souk Al Mina, Zayed Port | Closed Oct 2024 · ranked #16 MENA 50 Best |
| Barbassi by Marmellata | M39, Mina Zayed | Sister concept / expansion |

### What is NOT real

**The 256 lead pins and 12 opportunity pins are placeholder coordinates**, scattered manually across Abu Dhabi to show the format. The counts are real; the locations are invented.

**Do not present the demo as findings.** It demonstrates layout only.

---

## Technical findings from the demo

**The in-chat widget sandbox blocks external map tiles.** Leaflet loads but OpenStreetMap tiles do not render, producing a blank grey area. A standalone HTML file opened in a browser works correctly — this is a sandbox restriction, not a code problem.

**Use `cdnjs.cloudflare.com` for Leaflet, not `unpkg.com`.** unpkg was blocked and produced `Uncaught ReferenceError: L is not defined`.

**No API key or paid account is needed.** Leaflet + OpenStreetMap is free and requires no registration.

**HubSpot company records mostly hold only a city**, not a street address. Real pin placement therefore requires geocoding each business by name — the expensive part of any full build.

---

## Open cautions

**The join is the hard part, not the scraping.** Maps scraping is a solved problem. Matching a scraped listing to a HubSpot company to an admin-app client is not. One business appears as "Rain Café", "Rain Cafe LLC", and "RAIN - UAE" across three systems with no shared key.

`place_id` solves this going forward but not retroactively — existing clients need a one-time reconciliation that is probably partly manual.

**Freshness decays silently.** UAE F&B turns over fast. A map scraped once will quietly accumulate pins for businesses that have closed. Needs a refresh cadence and a visible date stamp, or people stop trusting it within months.

**Two loss taxonomies exist and should not be merged.** HubSpot deal-stage loss reasons and admin-app risk rejection reasons measure different things. A deal lost because a merchant went quiet is not the same as one rejected by Risk. Either one layer with a type flag, or two separate layers — decide up front.

**Scraping terms of service.** Scraped Maps data used internally is one position; feeding it into a shared or customer-facing artifact is another. Worth checking before it ships widely.

---

## Recommended build order

Ship each layer rather than holding everything for one release.

| Wave | Layer | Why this order |
|---|---|---|
| 1 | **Closed won, mapped** | Smallest dataset, highest immediate value, proves the concept |
| 2 | **Everything on the CRM** | Coverage view |
| 3 | **Maps universe, one industry** | The gap becomes visible for the first time |
| 4 | **Open deals** | Pipeline geography |
| 5 | **Revenue per city** | Depends on admin-app data being joined |
| 6 | **Closed lost with reasons** | Needs the taxonomy decision first |

Wave 1 alone is useful to an AE immediately. Do not hold it back for Wave 6.

---

## Two things to build in from the start

**Store `place_id` on every record touched.** Retrofitting means re-matching everything later.

**Date-stamp every Maps pull**, and show the date on the map.

---

## Open questions

1. **What identifies a client's location in the admin app?** City field, trade licence address, or free-text? This becomes the geographic key, and free text makes it materially harder.
2. **Revenue per city — measured how?** Disbursed amount, fees earned, or outstanding book? Three different maps, three different messages.
3. **Does the admin app carry industry?** If yes, the per-industry cut comes from there and avoids HubSpot's ~150-value picklist, which is null on 24.4% of companies.
4. **Refresh cadence** — how often does the Maps layer get re-pulled?

---

## Relationship to the main audit

Separate project. The CRM callable-leads audit and enrichment plan are the primary work; this is the agreed side project.

One connection worth keeping: the heat map answers **where** coverage is thin, which tells the enrichment work **where to point**. Where CRM saturation is high, enrichment is the right move — the records exist and need fixing. Where coverage is thin, sourcing is. Without the map, that choice is guesswork per segment.
