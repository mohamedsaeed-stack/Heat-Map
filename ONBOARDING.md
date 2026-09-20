# Heatmap Audit V01 — onboarding

You are picking up the **FlapKap UAE Coverage Map** for Mohamed Saeed (RevOps).
Read this file, then `START-HERE.md` (the full trap list), then `README.md`.

---

## 1. First five minutes

```bash
# Node 24 is installed but NOT on PATH. Every shell needs this first.
export PATH="/c/Users/Mohamed/AppData/Local/Microsoft/WinGet/Packages/OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe/node-v24.19.0-win-x64:$PATH"

# Rebuild the deliverable end to end (~5 seconds, no network needed)
node scripts/allocate-places.js       # company -> emirate + area, by evidence
node scripts/scatter-pins.js          # -> one coordinate per company
node scripts/build-map-data-uae.js    # -> data/map-uae.json
node scripts/build-standalone-uae.js  # -> dist/flapkap-uae-map.html
```

**There is no Python on this machine.** Everything is Node.

**`raw/` and `dist/` are gitignored**, so a fresh worktree has no data. If they are missing, copy
them from a previous worktree under `.claude/worktrees/` rather than re-pulling — the pulls took
hours and the files are on disk.

**Connectors needed:** HubSpot (present) and FlapKap-Admin (drops out intermittently — check
`session_connectors_status` before assuming it is gone for good).

---

## 2. What this is

One file — **`dist/flapkap-uae-map.html`** — that opens by double-click and needs **no network**,
because 574 OpenStreetMap tiles are base64 inside it. Also published privately at
**https://claude.ai/artifact/PYQb7axx5DtTWS8kYV47sv** (Version 12, 20 Sep 2026). Never make it public.

It shows where FlapKap's merchants are across all seven emirates: who is on the CRM, who has a live
deal, who was lost, who is funded — filtered by emirate, category, and **how precisely each pin is
known**.

### Current numbers

| | Companies |
|---|---:|
| **Drawn** | **31,771** |
| — exact geocoded street address | 3,649 |
| — inside a named area | 8,966 |
| — inside a named emirate | 16,956 |
| — UAE, emirate unknown | 2,200 |
| Location unknown — counted on the page, not drawn | 3,997 |
| Dropped as foreign | 561 |

Dubai 23,631 · Abu Dhabi 3,349 · Sharjah 1,532 · Ajman 483 · Ras Al Khaimah 354 ·
Fujairah 125 · Umm Al Quwain 97.

Closed won 469 (AED 49.9M, held by the 74 with a HubSpot deal value) · in process 742 / AED 444.2M · closed lost 427 / AED 215.8M.

### Coverage, so the totals are never oversold

| | | |
|---|---:|---|
| HubSpot portal | 47,516 | |
| …says United Arab Emirates | 29,355 | most of the map |
| …says somewhere else | 9,974 | out of scope |
| …says nothing at all | 8,187 | 8,040 had no location field at all: **4,043 now placed, 3,997 still unknown** — see §5 |
| Admin-app clients | 8,534 | only **718 (8.4%)** join to the CRM |
| Funded clients | 372 | 55 are Egyptian merchants, outside a UAE map → **317 UAE**. **319 funded pins on the map** (267 admin-app-only + 52 via the CRM name join) |
| **On the map** | **31,771** | 67% of the portal; every record with any UAE evidence is drawn |

---

## 3. The rules Mohamed set. Do not relitigate these.

1. **It must look like a real map.** Street map, named businesses, coloured pins. This is the
   measure of success and it took many iterations. Do not regress it.
2. **Scatter, do not hide.** A company we know is in a place is drawn *inside that place*, flagged
   as not-exact. What stays banned is inventing a **place** — scattering inside a real, measured
   boundary is fine.
3. **UAE only.** A company that says it is in Philadelphia or Cairo is dropped. This is a UAE map.
4. **Unknown is its own answer.** A company nothing can place is neither UAE nor foreign. Count it,
   flag it, do not guess it onto the map.
5. **Location evidence is emirate names, city names, UAE names — and, since 20 Sep 2026, the company's own
   phone area code and a `.ae` domain.** Mohamed's words: "+971 are all UAE". A +9714 landline names Dubai,
   +9712 Abu Dhabi, +9717 Ras Al Khaimah, +9719 Fujairah; a +9715 mobile or a `.ae` domain proves the country
   only. The number is read once, an emirate is derived, and the number is discarded. Ranked above contacts.
6. **Contacts count, but never pin.** A contact's city attributes the *company* to an emirate; it
   never produces a street-level pin (only 53 contacts CRM-wide have an address).
7. **No paid credits.** No Clay, Apollo, Lusha, Apify, Google Places. No search-engine scraping.
   Overpass and Nominatim only, inside their published policies.
8. **Every figure carries an explainer** with the formula and what would make it wrong.
9. **The admin app outranks HubSpot on won and lost.** HubSpot keeps pipeline.
10. **Save what you pull; search it on disk.** Never re-query for something already in `raw/`.

---

## 4. How the work is actually costed — read this before planning anything

Measured across this project: **99.85% of token spend was re-reading the conversation, not fetching
data.** 388 tool calls produced 483K tokens of content; 711 API calls at a 464K mean context
produced 331M tokens.

**What follows from that:**

- **Session length is the cost, not data volume.** A job that costs 20M in a fresh session costs
  220M at the end of a long one. Start expensive pulls early, or in a new session.
- **Bulk work belongs in Node scripts that write to disk.** Overpass, Nominatim, tile fetches and
  the website sweep cost ~0 conversation tokens. 22,000 websites were swept for nothing.
- **A WIDE HubSpot query is nearly free; a NARROW one is expensive.** Over ~75 KB the result spills
  to a file (~250 tokens). Under it, rows come back inline and cost thousands. **Ask for more
  columns on purpose.**
- **Publishing is cheap (~400 tokens regardless of file size); round trips are not.** Batch
  publishes to milestones.
- **Reading an artifact before republishing costs ~30K.** Do it once per session, then republish by
  the same `file_path`.
- **Agents help only when the work is parallel *reasoning* or needs a fresh context.** They do not
  make I/O faster — a Node script with concurrency 16 beats 16 agents at fetching web pages.

---

## 5. What is open

**Everything on the map side is done.** What is left is blocked on data, not effort.

1. **8,040 companies say nothing about where they are — DONE as far as it goes.** The website sweep
   finished on 20 Sep 2026: all 7,446 domains visited, **2,330 located (31.3%)**, against ~56% for
   companies with CRM data. With website, phone area code, `.ae` domain and contacts combined,
   **4,043 of the 8,040 are on the map and 3,997 remain unknown** — the page's "Location unknown"
   tile. Nothing else on these records can place them; the fix is in HubSpot, not on the map.
   Privacy: the phone is read, an emirate is derived, the number is discarded — no phone number
   reaches `raw/`, `data/` or the page.
2. **The admin app now has its own location — DONE 20 Sep 2026.** One `flapkap_get_client` call per
   funded client, 372 calls across 8 fresh agents, **~1.5M tokens and 6 minutes in total** (the
   ~20M–220M estimates were far too high; agents with a small context are the way). Findings:
   `legalAddresses` is **filled on 113 of 372** — real street addresses naming an area — so the old
   "always empty" claim came from a three-client sample; the licence authority names the emirate on
   193 more; **55 funded clients are Egyptian** (country EGY, +20 phones) and are counted, not drawn.
   Result: **319 funded pins** on the map (from 46) — 14 exact, 111 area, 123 emirate, 71 UAE-only.
   Script: `scripts/admin-licence-emirate.js`; details in `lookups/admin-license-emirate.md`.
   Re-run: only if the funded book changes — the per-client pull is the expensive part.
3. **The outstanding book — DECIDED 20 Sep 2026: emirate level, all seven emirates.** Mohamed's words:
   "I wanted on Emirates level, not Dubai level." Funded pins per emirate: Dubai 184, Abu Dhabi 33,
   Sharjah 13, Ajman 13, Fujairah 3, Umm Al Quwain 2, emirate unknown 71. Rows under 5 clients are
   merged so nothing reads back to one merchant. **The data side and the page panel are built and
   hidden until `raw/admin-balances.json` exists** (`[{id, outstanding, asOf}]`, one row per funded
   client). **Blocked on permission, not data:** the session's permission classifier refused
   `flapkap_get_credit_balance` and `flapkap_get_financials` (PII). Mohamed must allow the tool or
   switch the session to a mode that asks him; then it is the licence-pull recipe again (8 agents,
   ~6 min). See `lookups/outstanding-book.md`.
4. **Market universe outside Dubai — KEPT FOR LATER, by Mohamed's decision (20 Sep 2026).** With the
   book done, he considers the project ~80% complete; "businesses who are not on the CRM" is the
   remaining 20%. `lookups/uae-emirate-areas.json` already holds all seven boundary relations.
5. **19 stale deals** open in HubSpot for merchants the admin app already closed —
   `lookups/stale-deals.md`. A RevOps data-quality item, not a map item.

---

## 6. The traps that will cost you a day each

Full list in `START-HERE.md`. The three that bite hardest:

- **The HubSpot connector fails silently, in five different ways.** `ORDER BY` returns an *empty
  dataset* on cross-object queries. `OR` in a cross-object `WHERE` does too. `OFFSET` is *ignored*
  on cross-object queries — two pages at OFFSET 0 and 500 came back byte-identical. The 500-row cap
  is hard even when spilling. **Reconcile every pull against its own `COUNT(*)` before trusting it.**
- **Agents reporting success is not evidence the data arrived.** A 16-agent pull reported 16/16
  successes, but two returned the same spill path and one page was missing — 7,540 of 8,040, no
  error anywhere. Found only by bisecting on id and comparing each range to a count.
- **A raw apostrophe in page text kills the whole page.** The builder emits JS inside a template
  literal, so `company's` closes the string and the map renders blank. `\n` has the same problem.
  **No build check catches this. The only reliable test is opening the page in a browser**, which
  you should do before every publish.
- **The website sweep crashes Node on some hosts** — an assertion inside undici that cannot be caught.
  Before 20 Sep the restart retried the same host, crashed again, and 60 restarts gained 20 records. It
  now writes each host to `raw/website-inflight.log` *before* fetching it and writes a host off after
  two crashes (`raw/website-suspects.json`). Do not delete those files mid-sweep.

---

## 7. Where things live

```
START-HERE.md                    the handoff: state, decisions, every trap
README.md                        what it is, how to refresh, the rules
lookups/outstanding-book.md      why the revenue view is blocked, measured
lookups/admin-license-emirate.md the licence pull: how it was run, what it found, the authority table
lookups/data-quality-findings.md THE FINDINGS LOG - every measured data problem, for the CRM owner and the Head of RevOps. Append to it.
lookups/stale-deals.md           19 deals to fix in HubSpot
lookups/uae-places.json          the gazetteer: emirates, areas, 60 landmarks/misspellings
scripts/                         pull, locate, scatter, build - all Node
raw/                             gitignored: every pull, kept so nothing is re-queried
data/map-uae.json                what the page publishes
dist/flapkap-uae-map.html        THE DELIVERABLE
```

---

## 8. How Mohamed works

- He will interrupt mid-task with a correction. Take it as a redirect, not a complaint, and fold it
  in immediately.
- He wants **measured numbers, not estimates**. If you do not know, go and count it.
- He asks for **brief, plain-English explanations** — short sentences, concrete examples, no jargon.
  He is RevOps, not an engineer. "What did you break?" deserves a two-line answer a non-engineer
  reads once and understands.
- **Flag problems rather than building around them.** He has twice preferred being told something is
  blocked over being handed a misleading number.
- Send the built file with `SendUserFile` after meaningful changes; republish to the **same**
  artifact URL. Report measured usage percentages.
