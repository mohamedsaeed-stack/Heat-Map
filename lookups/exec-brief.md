# Executive brief — FlapKap UAE Coverage Map

Written 22 Sep 2026 for a C-level presentation, updated 24 Sep 2026 to build v24 of the map
(`dist/flapkap-uae-map.html`); nothing is estimated. Re-measure before reusing.

## The pitch, in solution-selling order

Say it in this order. Each line is measured; the number in bold is the one to say out loud.

**1. Where they are today (situation).** FlapKap's merchants live in two systems that do not share a key: HubSpot
(48,106 companies, 4,274 deals) and the admin app (372 funded clients). Nobody could put them on one page.

**2. What that costs (the pain).**
- **243 funded clients do not exist in HubSpot at all.** Sales cannot upsell, refer or even see them.
- Until this morning **AED 268M of open deals** (481 companies) showed as plain CRM records in the Dubai view, because the deal pull behind it was incomplete. The pipeline figure everyone quoted was AED 459M; it is **AED 727M**.
- Only **28% of won deals carry a value** in HubSpot. Any revenue chart built on HubSpot money is wrong.
- 8,040 companies had **no location at all** on 19 Sep; nobody could assign them to a territory. The team fixed most of it in one week - it is down to 2,772.
- **NaN% of everything we prospect is Dubai.** Retail, the largest visible market, has 7 CRM records per 100 real shops. Ajman has 13 per 100 and converts at 3.3%, twice the UAE rate.
- Two-thirds of funded clients sit in one emirate (HHI 6,525 - "highly concentrated" in a lender's vocabulary), and no one was measuring it.

**3. What changes with the map (the solution).** One page, both systems, every company placed by emirate, area or
street (33,408 pins), every funded client (317 of 317), every deal, and the visible market around them (39,370
businesses). Filters by emirate, category, precision, HubSpot owner and the commercial who closed it. One click to the
HubSpot record or the admin-app client. Rebuilds in seconds when the CRM changes; today's address load flowed through the same day.
Cost of external data: **AED 0**.

**4. Proof it holds up.** Funded pins reconcile to the admin app exactly (317 = 317). Every pin was re-checked
against all 4,274 deals and against admin-app status (761 stale verdicts corrected today). 40 data-quality findings,
each with a count and a fix, are ready for the CRM owner. An SDR already spotted a company on the map and booked the meeting.

**5. What we need decided (the ask).**
1. A shared client key between HubSpot and the admin app, and city + country required on company create. Every cross-system number depends on it.
2. The rule for the **151 companies won in HubSpot with no funded record in the admin app** - real wins, stale stages, or admin lag. The map counts them as won until told otherwise.
3. An emirate-mix target. Is expansion beyond Dubai a plan or a slogan? Ajman is the cheapest test.
4. Hosting behind a company login so every team can open it (Railway or Cloudflare, one afternoon).

## Why the map exists

FlapKap's merchants sit in two systems that don't talk (HubSpot, admin app). The map is the first
single view of the UAE book — prospects, pipeline, funded — by emirate and area, with every figure
explained on the page.

## KPIs

| KPI | Today (measured) | Reasoning — why track it, what it decides |
|---|---|---|
| **Market coverage** — CRM records per 100 visible businesses, by category (UAE-wide, 23 Sep 2026) | Retail **7** · Hospitality 31 · Auto 38 · Medical 60 (contracting, manufacturing, marketing exceed 100: OpenStreetMap barely sees office-based firms) | Shows where we have barely prospected vs. saturated. Retail is the largest visible market and our thinnest coverage → that is where new prospecting effort should go. |
| **Emirate share of CRM** | Dubai **NaN%** · Abu Dhabi 10% · Sharjah 5% · rest 3% | Tests whether "UAE expansion" is real. Three-quarters of all prospecting in one emirate is a growth ceiling, not a strategy. |
| **Emirate coverage vs. visible market** — CRM records per 100 visible businesses | Ajman **13** · Sharjah 23 · Fujairah 23 · Umm Al Quwain 23 · Abu Dhabi 36 · RAK 77 · Dubai 129 | The white space by emirate. Ajman and Sharjah have thousands of visible shops and restaurants and almost no CRM presence. |
| **Funded concentration** | Dubai holds **68%** of funded clients · HHI **6,525** | Portfolio risk. A Dubai-specific shock (rents, regulation, one sector) hits two-thirds of the book. Above 2,500 on HHI is "highly concentrated" in lenders' language — a board-level number. |
| **CRM → funded conversion, by emirate** | UAE **1.5%** · Dubai 1.35% · **Ajman 3.3%** · **RAK 0%** (354 records, no client) | Shows where effort converts. Ajman converts at over twice the rate with almost no effort → cheapest growth. RAK has 354 prospects and zero clients → untouched or wrong market; decide which. |
| **White space** — dense CRM areas, no funded client | Trade Centre: 178 companies, **0 funded** · Silicon Oasis: 454, **1 funded** | Records already exist, so a targeted push there costs nothing to source. Either a sales gap or a fit problem — both worth knowing. |
| **Pipeline by geography** | 1,253 open deals / **AED 727.3M** UAE-wide (was 764 / AED 459M before every pin was re-checked against all 4,274 deals on 24 Sep); by company emirate all 4,274 deals split Dubai 2,232 · Abu Dhabi 204 · Sharjah 98 · Ajman 32 · rest 27 | Where future revenue sits. The pipeline is 87% Dubai — the emirate-mix decision is not only about prospecting but about where deals get worked. |
| **Location completeness** | **94%** of CRM placeable (83% → 92% → 94% after the 24 Sep address load) · 2,772 unknown | A record we can't place can't be assigned to a territory, mapped or counted. Those 2,772 are invisible to any geographic plan. |
| **System join rate** | **13.7%** of admin clients match HubSpot (was 8.4%) · **243 funded clients absent from HubSpot** | Every cross-system number — this map, conversion, revenue attribution — is only as good as this join. 243 funded clients invisible to sales means no upsell, no referrals, wrong win rates. Highest-value fix in the list. |
| **Won deals carrying a value** | **28%** (129 of 468 closed won, 24 Sep) | HubSpot revenue reports miss two-thirds of won deals. Any board figure built on HubSpot money is wrong until this is fixed. |
| **Stale deals** | **19 / AED 12.75M** open in HubSpot, already decided in the admin app | Inflates pipeline and wastes rep time on merchants already funded or rejected. Proof the systems don't write back. |

How each was measured: `data/map-uae.json` (companies, layers, emirates, areas, universe), the
per-client licence pull (`raw/admin-licence-emirate.json`), and `lookups/data-quality-findings.md`.
Market coverage = Dubai CRM records in a category ÷ Dubai OpenStreetMap businesses in that category × 100;
OSM is a floor (strong on shops and restaurants, weak on offices). HHI = sum of squared percentage
shares of funded clients by emirate, known emirates only.

## What the project delivered

- 33,408 companies placed, all seven emirates, one pin per company, one file, no login, refreshes in 5 seconds.
- Funded clients on the map: **46 → 317** (all 317 UAE funded clients); 74 of them sit on their own CRM record. Closed won on the map = 317 funded (admin app) + 151 won in HubSpot only.
- Companies with no location: **8,040 → 2,772**, free sources only; the team's 24 Sep address load in HubSpot (16,989 records changed) flowed through in one rebuild.
- 29 measured data-quality findings, each with a count and a fix.
- External data spend: **AED 0**.
- Already in use: on 24 Sep an SDR noticed Tech Power Group UAE (a CRM record with no address, emirate-level pin) while prospecting on the map and booked a meeting.

## Caveats to state

Deals are UAE-wide (all 4,274 pulled 24 Sep 2026); 1,120 of them have no company attached and cannot be placed. The visible market (OpenStreetMap) is a floor. 97% of pins are
approximate by design — right area, not the building.

## What each team would use it for — three things each

**Sales / Commercial**
1. Pick where to prospect: retail has 7 CRM records per 100 visible businesses UAE-wide — the thinnest coverage of any category; Ajman and Sharjah are the thinnest emirates (13 and 23 per 100).
2. Work the white space: Trade Centre (178 prospects, 0 funded) and Silicon Oasis (454, 1 funded) — records already exist, no sourcing cost.
3. Plan territories by emirate and area instead of by rep memory; RAK has 354 prospects and nobody has closed one.

**Marketing**
1. Target campaigns by area and category where coverage is low, not where the CRM already is.
2. Show funded clients on a map to anchor referral and local-partner campaigns (Ajman converts at 3.3% — a proof-point market).
3. Measure campaign reach as a coverage change per emirate, quarter on quarter.

**Risk / Credit**
1. See portfolio concentration: 68% of funded clients in Dubai, HHI 6,525 — highly concentrated.
2. Set diversification targets by emirate and track them.
3. Later: outstanding book by emirate (built, parked) — exposure where the money actually sits.

**RevOps / CRM owner**
1. Fix the 40 measured data problems, biggest first: 13.7% system join, 243 funded clients missing from HubSpot, 339 won deals with no value.
2. Close the 19 stale deals (AED 12.75M of fake pipeline).
3. Track data health as a number: 94% location completeness today, target 98%.

**Leadership**
1. One honest picture of the UAE book — prospects, pipeline, funded — with every figure explained on the page.
2. Decide the emirate mix: is expansion beyond Dubai real (NaN% of prospecting is Dubai) or a slogan.
3. Judge revenue numbers with their caveat: only 28% of won deals carry a value in HubSpot, so HubSpot revenue is not the truth yet.

## Next

Visible market now covers all seven emirates (39,370 businesses). Outstanding book by emirate
is built and parked. CRM fixes lift the data-health KPIs.
