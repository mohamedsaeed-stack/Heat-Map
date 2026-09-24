# Data-quality findings from the UAE coverage map

**Purpose.** Every genuine data problem the map build surfaced, in one place, so it can go to the CRM
owner to correct and to the Head of RevOps to review. Each finding says what was measured, how many
records, and what would fix it. Nothing here is estimated; every count was produced by a script over
data pulled from HubSpot or the FlapKap admin app and can be re-run.

**Keep appending.** New findings go at the bottom of the right section with the date. Mohamed will ask
for this file when the project is done.

Sources: HubSpot portal 25308329 (47,516 companies, pulled 19 Sep 2026) · FlapKap admin app (8,534
clients, 372 funded, pulled 19–20 Sep 2026). Owner: Mohamed Saeed, RevOps.

---

## A. HubSpot — location data

| # | Finding | Count | How measured | Suggested fix |
|---|---|---:|---|---|
| A1 | **Companies with no location at all** — no city, country, state, address or postcode | **8,040** (17%) on 19 Sep → **3,699** (8%) after the 24 Sep address load | `COUNT(*)` with every location field empty, reconciled against the portal total | Make city and country required on company create. Backfill from the phone (see A2). |
| A2 | …of those, the **phone area code names the emirate** (+9714 Dubai, +9712 Abu Dhabi, +9717 RAK, +9719 Fujairah) | **1,091**; a further 955 have a `.ae` domain proving UAE | `scripts/recover-unlocated.js` — number read, emirate derived, number discarded | A one-off HubSpot workflow: set country = UAE and city from the area code where both are empty. |
| A3 | …and after every free route (website, phone, `.ae`, contacts) **still unplaceable** | **3,997** → **2,772** after the 24 Sep load | `scripts/allocate-places.js`, "location unknown" | These need a human or the owner rep. Most have dead domains — likely dead leads; consider archiving. |
| A4 | **Country says elsewhere while city or name looks UAE** — e.g. "219 Dubai" with country India, "UAE Clearing" with country Czechia | **510** | allocator: name/city evidence refused when country contradicts | Review; most are foreign companies that got a UAE city by mistake. |
| A5 | **Phone number typed into the website / domain field** — e.g. `971549984434.com`, `506868717.com` | **179** | regex over the domain field of the 8,040 | Validation on the website field; move the digits to the phone field. |
| A6 | **Contacts almost never carry an address** | **53** contacts in the whole CRM | `COUNT(*)` on contacts with address | Not worth fixing; noted so nobody expects contacts to place a company. |
| A7 | **City spelt many ways** — Dubai alone has dozens of variants (see `lookups/dubai-city-variants.tsv`) | dozens | distinct-value count on `city` | Make city a dropdown of the 7 emirates + major cities. |
| A8 | **Duplicate company records.** The same company appears more than once in the same place — twice in HubSpot, or once in HubSpot and once in the admin app under a slightly different legal name | **314** companies, **417** extra records; 11 span both systems | name match after stripping legal suffixes, same emirate and area | Merge in HubSpot; the map already shows one pin. A shared key with the admin app (D1) prevents the cross-system kind. |
| A10 | **Companies with no HubSpot owner** — nobody is responsible for the record | **16,400** of 31,354 on the map (52%) | `owner` field on the pin data, 24 Sep 2026 | Assign owners or an explicit "unowned pool" queue; 53 owners hold the rest, top owner 1,714 records. |
| A9 | **Company name is a job title** — "Chief Executive Officer" x12, "CEO" x6, "General Manager" x1 | **19** | exact name match | Fix the names; these records cannot be matched, mapped or deduplicated. |

## B. HubSpot — deals and money

| # | Finding | Count | How measured | Suggested fix |
|---|---|---:|---|---|
| B1 | **"Customers" with no won deal amount.** 202 HubSpot companies are closed won; only **74** have a won deal with an amount (AED 49.9M). **101 have no won deal at all** (63 are customers only by lifecycle stage; 28 only because the admin app says funded; 10 both) and **27 have a deal with the amount left empty** | **128** of 202 | `data/map-uae.json`, layer closed_won, deal amount field | Every funded merchant should have a won deal with the disbursed amount. The admin app knows the amount; write it back. |
| B2 | **In-process deals with no amount** | **104** of 742 | same | Amount required before a deal leaves the first stage. |
| B3 | **Closed-lost deals with no amount** | **132** of 427 | same | Lower priority; affects the "lost AED" figure only. |
| B4 | **Stale deals: open in HubSpot, already decided in the admin app** — 7 the admin app has funded, 12 it has rejected or closed; **AED 12.75M** of pipeline that is not pipeline | **19** | name join, then stage compared record by record — full list with owners in `lookups/stale-deals.md` | Owners close or re-open each one deliberately. Root cause: nothing writes admin outcomes back to HubSpot. |
| B6 | **Deals with no company attached** — a deal that is not linked to a company cannot be placed, attributed to an emirate or matched to the admin app | **1,120** of 4,274 (26%) | all-deals pull, 24 Sep 2026, `company_id` empty | Require a company association when a deal is created. |
| B7 | **Deals in the legacy "UAE Pipeline (default)"** with stages outside the approved stage map (Unworthy 417, Totally Lost 351, Ongoing Conversation 324…) — never counted in any layer | **1,234** | same pull; `lookups/stage-map.json` | Decide what each legacy stage means (won / lost / open) or archive the pipeline. |
| B8 | **Won in HubSpot, never funded per the admin app** — 150 closed-won pins carry no funded admin record; 46 of them ARE joined to an admin client whose financing status is NEW (28 at "Money Disbursed", AED 19.85M: SQUATWOLF, hiCar, Park Lane, Ninjoo…) | **150** (46 joined, 104 unmatched) | audit 24 Sep 2026, `af=0 && l=closed_won` | Decide: is "Money Disbursed" in HubSpot without a funded admin record a stale stage or an admin lag? Until then the map counts them as won and the brief says so. |
| B9 | **HubSpot won, admin app rejected** — Protectol Health (Money Disbursed AED 1.5M vs AUTO_REJECTION), VDR Marine (customer vs POST_ANALYSIS_REJECTION) | **2** | audit 24 Sep | Admin wins on the map (drawn lost). Fix the HubSpot stage. |
| B10 | **The Dubai deal pull was incomplete** — 1,501 of 4,274 deals, so 761 pins carried a stale verdict until every pin was re-checked on 24 Sep (481 open deals worth AED 268M were shown as plain CRM) | **761** pins | `stats.dealRecheck` | Fixed in the build; noted so nobody trusts a partial pull again. |
| B5 | **HubSpot and admin app disagree on a merchant's status** (B4 is the urgent subset) | **158** | same join | Same root cause as B4. |

## C. HubSpot — classification

| # | Finding | Count | How measured | Suggested fix |
|---|---|---:|---|---|
| C1 | **Industry blank** | **7,462** companies on the map | category mapping over the industry picklist | Required field at create; the admin app's industry could be written back for the 718 joined. |
| C2 | **Industry set but outside the eight target categories ("Other")** | **4,447** | same | Review the picklist; IT & software was in "Other" until 19 Sep (2,919 companies) — there may be more such buckets. |

## D. Admin app

| # | Finding | Count | How measured | Suggested fix |
|---|---|---:|---|---|
| D1 | **No shared key with HubSpot.** The only join is by company name and it reaches **718 of 8,534** clients (8.4%). **267 funded clients have no HubSpot record at all** | 8.4% joined; 267 funded unjoined | `scripts/match-admin-clients.js`; `raw/admin-match.json` | Store the HubSpot company id on the admin client (or a shared `source_id` on both). This is the single highest-value fix in the list. |
| D2 | **Funded clients with no registered address** (`legalAddresses` empty) | **259** of 372 (203 of them UAE) | per-client pull, 20 Sep 2026 | Capture the licence address at onboarding — it is on the trade licence document already collected. |
| D3 | **Funded clients with no licence number string** | **152** of 372 (96 of them UAE) | same | Same document, same fix. |
| D4 | **Licence strings with no issuing authority** — "main license no 12345", "license no 6789" | 6 strings | `scripts/admin-licence-emirate.js`, unrecognised-authority list | Store authority (DET, SEDD, ADDED, DMCC…) as its own field. |
| D5 | **Funded clients with no website** | **180** of 372 | same | Optional field; noted because the website was the best free route to an area. |
| D6 | **Funded clients that are Egyptian merchants** in a UAE-scoped review (country EGY, +20 phones) | **55** of 372; 1 more has no country at all | same | Not an error — but the country field is the only marker, so it must stay filled. Set the one missing country. |
| D7 | **Industry empty on most funded clients** in the client summary | ~330 of 372 | `raw/admin-clients.json`, `ind` field | Populate at onboarding; would fix C1 for joined clients too. |
| D9 | **Funded clients with no commercial owner assigned** in the admin app (`assignedAdmins` has no COMMERCIAL entry; 9 more only carry a referral code) | **174** of 372 | per-client pull, 24 Sep 2026 | Make a commercial owner mandatory at funding; it is the basis of any "who closed it" view. |
| D10 | **Owner names inconsistent** — first names only ("Razan", "Kunal", "Jenane"), UPPERCASE ("KHAN", "SUBASEELAN"), duplicates of the same person ("Suba" / "SUBASEELAN") | 24 distinct strings for what is likely ~15 people | same | Assigned admins should reference the admin user record, not free text. |
| D8 | **Probable false name joins**: two HubSpot companies flagged funded because their name matches an Egyptian funded client — *Maxim Food* (HubSpot 109968428237) and *Palma Holding* ↔ *Palma* (HubSpot 422598436088) | 2 | join against the per-client country | Check whether these are the same group; if not, the join needs the key in D1. |

| D11 | **Same client name, one id funded and another rejected** in the admin app — SKYGEN TRADING, Express Farsi, Lemon Chilli, Safyan IT, Pratham, Petal Box, Sports Hype, ORB | **8** groups | audit 24 Sep, name match within admin clients | Merge or link the duplicate client records; the map keeps the funded one. |
| D12 | **Foreign funded client name-matched to a UAE CRM company** — Palma, Maxim Food, Denver (Egypt) matched UAE records by name | **8** (3 were drawn funded in Dubai/Sharjah until 24 Sep) | licence `foreign` flag vs name join | Kept apart on the map now; a shared key (D1) ends this class of error. |

## E. Map-side notes for the reviewer (not CRM fixes)

- The map draws every company with any UAE evidence — **31,354 pins after merging 417 duplicates** (one pin per company per place; branches stay). Foreign records (561) are dropped; unplaceable ones (3,997) are counted, not drawn.
- **Pins are exact only when a street address geocoded** — 3,649 of them. Everything else is scattered inside the real area or emirate and labelled as such.
- **Won money on the page is the HubSpot deal amount of 74 deals**; most of the 462 funded pins carry no amount (B1 + the 267 admin-only clients). The explainer on the tile says this.
- The market universe (OpenStreetMap businesses) covers **all seven emirates: 38,950** named businesses (23 Sep 2026). It is a floor — blind to office-based firms.

---

## F. HubSpot — the 24 Sep 2026 address load (what it fixed, what it exposed)

The team loaded street addresses, cities and countries into HubSpot on 24 Sep 2026: **16,989 company records changed** since the 20 Sep snapshot, 591 companies are new, and the portal now holds 48,106. Records with no location field at all fell from 8,040 to 3,699 (−54%); records with no country from 8,187 to 3,721. The map absorbed it in one rebuild. What the load exposed:

| # | Finding | Count | How measured | Suggested fix |
|---|---|---:|---|---|
| F1 | **UAE city, foreign ZIP or state** — "1600 Amphitheatre Parkway, Dubai, 94043" is Google's HQ; "5350 Alpha Road, Dubai, Texas 75240"; state = California under city Dubai | **1,171** (967 Dubai, 108 Abu Dhabi, 53 Sharjah) | allocator conflict rule: UAE city + (US/UK postcode on a numbered street, or a foreign state). The UAE has no postal codes. | An enrichment tool wrote the global HQ address over UAE records. Clear address/ZIP/state where the ZIP is foreign, or correct the city. The map keeps these in their emirate and ignores the address; the popup flags each one. |
| F2 | **Country = UAE, city is a foreign capital** — London, New York City, San Francisco, Cairo | **73** | delta pull, 24 Sep | Fix country or city; these are most likely foreign companies. |
| F3 | **Address names one emirate, city another** — "Sharjah Ring Road" under Dubai, "Dubai - Fujairah Road" under Al Fujairah City | **5** | text match | Review by hand. |
| F4 | **Address is only a road name** — "Sheikh Zayed Road" ×160, "شارع الشيخ زايد" ×143, "Marasi Drive" ×39. 873 of the 1,288 geocoded addresses resolve to a road, and 462 companies sat stacked on one Sheikh Zayed Road point | **873** road-level addresses, ~2,800 companies | Nominatim result class = `highway` | Add the building, unit or area (Business Bay, JLT) to the address. Until then the map draws these as "street only", spread along the road, never as an exact pin. |
| F5 | **Numbered street with no area** — "Street 2", "شارع 4", "Road 12"; every district has one | **647** refused as generic (includes bare emirate names) | geocoder generic rule | Add the area; a street number alone cannot be placed. |
| F6 | **Arabic-only addresses** — same streets as F4 in Arabic script | **1,771** of the 6,294 addresses in the delta | script test | Nothing to fix for the map (OpenStreetMap geocodes Arabic); agree one language per field so duplicates can be matched. |

## Log

- **19 Sep 2026** — A1, A4, A6, A7, B4, B5, C2 (IT & software), D1 first measured during the Dubai and UAE builds.
- **20 Sep 2026** — A2, A3, A5 measured after the website sweep finished (7,446 domains, 31.3% located). B1–B3, C1 re-measured on the final build. D2–D8 measured from the per-client licence pull (372 calls). E written.

- **24 Sep 2026** — Funded/lost audit: B8–B10 and D11–D12; every pin re-checked against all 4,274 deals (761 verdicts corrected), admin-app lost applied UAE-wide (236 pins), money tiles UAE-wide, foreign funded clients kept off UAE pins.
- **24 Sep 2026** — F1–F6 from the team's address load (16,989 records changed, 591 new companies); A1 and A3 counts superseded (8,040 → 3,699 with no location field; 3,997 → 2,772 still unplaceable). Road-level geocodes now drawn as area only; conflicting records placed by city only.
- **24 Sep 2026** — A10 (16,400 unowned companies), D9 (174 funded clients with no commercial owner), D10 (owner names inconsistent) from the owner pull and the owner filter.
- **24 Sep 2026** — B6 (1,120 deals with no company) and B7 (1,234 legacy-pipeline deals unclassified) from the all-deals pull; pipeline and lost layers now UAE-wide.
- **23 Sep 2026** — A8 (duplicates, measured by the merge pass) and A9 (job-title names) added after the one-pin-per-company rule; universe extended to all seven emirates, CRM-per-visible ratios measured (README).