# Heatmap Audit V01 — onboarding

You are picking up the **FlapKap UAE Coverage Map** for Mohamed Saeed (RevOps).
Read this file, then `START-HERE.md` (the full trap list), then `README.md`.

---

## 1. First five minutes

```bash
# Node 24 is installed but NOT on PATH. Every shell needs this first.
export PATH="/c/Users/Mohamed/AppData/Local/Microsoft/WinGet/Packages/OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe/node-v24.19.0-win-x64:$PATH"

# Rebuild the deliverable end to end (~90 seconds, no network needed)
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
**https://claude.ai/artifact/PYQb7axx5DtTWS8kYV47sv** (Version 10). Never make it public.

It shows where FlapKap's merchants are across all seven emirates: who is on the CRM, who has a live
deal, who was lost, who is funded — filtered by emirate, category, and **how precisely each pin is
known**.

### Current numbers

| | Companies |
|---|---:|
| **Drawn** | **28,748** |
| — exact geocoded street address | 3,649 |
| — inside a named area | 7,543 |
| — inside a named emirate | 16,192 |
| — UAE, emirate unknown | 1,364 |
| Dropped as foreign | 617 |

Dubai 21,886 · Abu Dhabi 3,112 · Sharjah 1,436 · Ajman 442 · Ras Al Khaimah 323 ·
Fujairah 103 · Umm Al Quwain 82.

Closed won 198 / AED 49.9M · in process 742 / AED 444.2M · closed lost 427 / AED 215.8M.

### Coverage, so the totals are never oversold

| | | |
|---|---:|---|
| HubSpot portal | 47,516 | |
| …says United Arab Emirates | 29,355 | → 28,748 on the map |
| …says somewhere else | 9,974 | out of scope |
| …says nothing at all | 8,187 | see §5 |
| Admin-app clients | 8,534 | only **718 (8.4%)** join to the CRM |
| Funded clients | 372 | only **46** are on the map |

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
5. **Location evidence is emirate names, city names and UAE names.** Nothing else.
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

1. **8,040 companies say nothing about where they are** — 17% of the portal. 2,072 have now been
   recovered as UAE from **phone area codes** (`+9714` = Dubai, `+9712` = Abu Dhabi) and **`.ae`
   domains**; a website sweep over their 7,448 domains is the current lift. See
   `scripts/recover-unlocated.js`. **Privacy: the phone is read, an emirate is derived, the number
   is discarded. No phone number reaches `raw/`, `data/` or the page.**
2. **The admin app is the weak half — 46 of 372 funded clients on the map.** The join is by company
   name and reaches 8.4%. `legalAddresses` is **empty**, including on funded clients — the brief was
   wrong about that. The location actually lives in `businessInfo.licenseNumbers`
   (`"636960 DET-Dubai"`). See `lookups/admin-license-emirate.md`. No bulk route exists; **run it in
   a fresh session** where it costs ~20M instead of ~220M.
3. **The outstanding book is blocked and should not be built yet.** Only 48 funded clients are
   placeable and they sit in 4 areas with 1–2 clients each, so an area total would expose individual
   balances. See `lookups/outstanding-book.md`.
4. **Market universe outside Dubai** — parked by Mohamed's decision until the CRM/admin side is
   finished. That point has now been reached, so this is available to pick up.
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

---

## 7. Where things live

```
START-HERE.md                    the handoff: state, decisions, every trap
README.md                        what it is, how to refresh, the rules
lookups/outstanding-book.md      why the revenue view is blocked, measured
lookups/admin-license-emirate.md legalAddresses is empty; licenceNumbers is the signal
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
