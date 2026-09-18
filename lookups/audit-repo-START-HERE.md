# Start here — handoff for a new session

**Your task is steps 4, 5 and 6 of Option 1. Steps 1-3 are already done — do not repeat them.** Everything it depends on is committed. Read this file, then `lookups/wrong-number-paths.md`, then start. Read the other lookups only when a step needs them.

---

## The job in one paragraph

A read-only audit of FlapKap's HubSpot CRM (portal **25308329**) for the Head of RevOps: how much of the database a rep can actually work, what each lead source produces, where deals stall. The deliverable is a published report page, not a local app.

**Live report:** https://claude.ai/artifact/W2uaRLqXrx32HWj5jwzQgh
**That link still shows the OLD page.** The rebuilt page is committed but not published to it yet.

---

## Option 1 — approved by the user and waiting

Quoted at ~53K tokens / ~11 points of a 5-hour window from a 430K context. From a fresh session it should cost materially less.

### Step 1 — verify the rebuilt page

A staging copy is published but **unverified**: https://claude.ai/artifact/JoNaYxFkY8DSQ912yjQwUB

Opening it in the built-in browser was **denied by the permission classifier** ("Unrequested Artifact Publish"). Either ask the user to grant permission, or ask them to open it and report back. Local files cannot be driven — they render as static `data:` snapshots.

Confirm: three dropdowns that do **not** reset one another, a count line updating as they combine, nine source rows, and a HubSpot link that opens a real lead.

### Step 2 — pull the wrong-number calls — DONE, committed `02f1f99`. DO NOT RE-RUN. Kept below only as a record of how it was done.

One pass gets both sides. The "Wrong number" disposition GUID is `17b47fee-58de-441e-a44c-c6300d46f273`.

```sql
SELECT hs_object_id, hs_createdate, hs_call_source,
       CONTACT.hs_object_id, CONTACT.phone, CONTACT.mobilephone,
       CONTACT.phone_number_2, CONTACT.disqualification_reason
FROM CALL
WHERE hs_call_disposition = '17b47fee-58de-441e-a44c-c6300d46f273'
  AND hs_createdate BETWEEN '<start>' AND '<end>'
```

5,531 calls total. Monthly counts, so you need not re-query them:

| Month | Calls | Month | Calls |
|---|---:|---|---:|
| pre-2025-08 (all) | 11 | 2026-03 | 661 |
| 2025-08 | 39 | 2026-04 | 898 |
| 2025-09 | 442 | 2026-05 | 655 |
| 2025-10 | 374 | 2026-06 | 557 |
| 2025-11 | 237 | 2026-07 | 686 |
| 2025-12 | 175 | 2026-08 | 247 |
| 2026-01 | 176 | 2026-09 | 172 |
| 2026-02 | 201 | | |

Sums to 5,531. Pack into ~13 partitions of **no more than 430 calls** each, per the sizing rule below. A 280-row test partition confirmed this query shape works and fans out only slightly.

### Step 3 — aggregate locally — DONE. Every figure is in "Framing for steps 4–6" at the end of this file, and in `lookups/wrong-number-analysis.md`.

Deduplicate on the **call** id, then the **contact** id, and compute:

1. **Union and intersection of the two wrong-number signals** — contacts flagged by lead disqualification (2,422 leads / 2,394 contacts) against contacts with at least one wrong-number call. The overlap says how much each process misses.
2. **Fallback-number classification** — for each flagged contact, how many of `phone`, `mobilephone`, `phone_number_2` are populated. **One number and it is wrong → needs enrichment outright. Two or three → may still be reachable.** This is the actionable half of the user's question.

### Step 4 — add three things to the page — START HERE

- **A caveat** on the wrong-number figures: they cover the lead-disqualification path only.
- **The VoIP blind spot** — the most important finding of the last session. See `lookups/wrong-number-paths.md`.
- **The union + fallback section** from step 3.

### Step 5 — publish once, to the live URL

```
url:   https://claude.ai/artifact/W2uaRLqXrx32HWj5jwzQgh
files: {"cube.js": "snapshot/cube.js"}
```

You **must read the live artifact first** (~18K) — a publish to an artifact this conversation has not read is refused. Budget for it.

**Keep `cube.js` a separate file. Never inline it.** At 152KB, inlining makes every future read of the page cost ~60K.

### Step 6 — delete the staging artifact

Confirm with the user first. Never delete without asking.

---

## State of the build

| | |
|---|---|
| `snapshot/dashboard.html` | 64,750 bytes — rebuilt, committed `537259c`, **not published live** |
| `snapshot/cube.js` | 152,176 bytes — 6,849 lead records, all dimension totals reconciled |
| Verified | structure, element ids, cube totals |
| Not verified | runtime behaviour in a browser |

The rebuilt page makes source x industry x owner **combine**, driven by the 6,849 records rather than precomputed cuts, and links every reason to a real lead in HubSpot.

---

## Seven traps that have already cost time

1. **`GROUP BY` plus an association filter silently undercounts** — 85% low in one measured case, no error raised. Use separate direct `COUNT(*)` per value.
2. **Every result caps at 500 rows and truncates silently**, record selects included. The `Showing X of Y` line is the only warning — read it every time.
3. **Cross-object record selects fan out** — one row per associated record, not per lead. 7,165 rows for 6,849 leads. Deduplicate on `hs_object_id` before aggregating anything.
4. **`DATE_TRUNC(…, 'DAY')` over an open range is silently rewritten to `'YEAR'`.** Daily buckets need an explicit `BETWEEN` in the same query.
5. **`LIKE` does not work on phone fields.** Exact match only; HubSpot normalises to `+971…`.
6. **Always test `phone OR mobilephone`** — `phone` alone reports 15,507 missing instead of 7,637. A **third** field exists, `phone_number_2`.
7. **Deal stage IDs are mislabelled** — `closedwon` is "Offer Sent", `closedlost` is "Signed". Five pipelines with colliding stage names.

Evidence for 2, 3 and 4 is in `lookups/source-fields.md`.

---

## Sizing a partitioned pull — the rule that saves the most money

Two limits bracket the usable size:

| Limit | Effect |
|---|---|
| 500 rows | above this, silent truncation |
| ~50,000 characters | **above** this, the result spills to a file instead of returning inline |

Spilling is what you want — a file costs almost nothing, while a few-hundred-row inline result is the single largest avoidable cost in this project. At 110–180 characters per row, aim for **450–480 rows**. If a partition would land just under the spill threshold, **add a useful column to widen the row** rather than accept it inline.

Place boundaries from exact daily counts, never by splitting months evenly — bulk-import days break any even split.

---

## Environment

**`node` and `python` are not usable on this machine.** `python` resolves only to the Microsoft Store alias stub. The committed `scripts/*.js` are from an earlier environment and will not run.

Aggregate in **PowerShell 5.1**: `Get-Content -Raw | ConvertFrom-Json`, splitting on tabs, `Group-Object`. No `&&` or `||`, no ternary, no `-AsHashtable`. Two traps already hit:
- Several bash heredocs in one call break on quoting. Use the Write tool for files with markdown backticks; if the file already exists, delete it first so Write is not blocked by a stale read.
- A `//`-based comment stripper eats the closing quote of any string containing `https://`.

---

## Cost discipline — the user cares about this a lot

**Alert unprompted before usage bites.** Check `get_usage` at session start and before any expensive step, and state the numbers plainly. The user asked for a hard alert and set a **98% ceiling** on optional work.

**Do not quote a tokens-per-point rate.** A previous session estimated "1 point per 6K" and then watched 95% go to 99% in a few ordinary turns. The rate degrades as context grows, because every turn re-sends the whole conversation. Report measured percentages instead.

**The absolute token allowance behind the percentages is not published.** Do not invent one. If asked for tokens, give the work estimate and say plainly that percent is the only reliable figure.

**Starting a fresh session is the biggest lever available** — bigger than any choice between scope options. This handoff exists because the previous session reached a 430K context, where every turn cost ~430K input tokens regardless of how small the work was.

---

## Open questions the user still owes

**For step 4's copy:**
- Which team uses which tool? Three motions exist — VoIP integration (34,534 calls), mobile apps (19,201), CRM-logged (65,657) — and **nothing in the data labels them BDR or SDR**. Without an answer, describe them by tool and leave team names off.

**On sources — do not guess; label unknown sources by their raw name:**
1. What is **"Leads sheet"** (6,792 contacts, second-largest source)?
2. What are **Deliveroo database, Ayush network, Growdash, Syrve Leads, Revly Leads, Telr, Amazon Seller Society, Dubai List Leads**?
3. **Cognism** (256) — a second contact-data vendor. Still in use?
4. **Lead Machine** (415) — what is it?
5. **"Lead Generation"** (1,651) against the tag's "Lead Generation Team- Lusha" — same team, different tool?
6. Does **`lead_sources`** ("Lusha Sync", 29,420 records) mark provenance, or merely that the tool touched the record?

A cheap way to close 1–4 was offered and never run: **profile each unknown source** by creation mechanism, arrival dates and owner (~6–8K), turning the questions into confirmations. Re-offer it.

---

## How the user wants this done

- **Characterise sources, do not prosecute one.** An earlier draft read as a case against one vendor and was rejected for it.
- **Every figure carries an explainer** — an `i` control showing how it was derived and what would make it wrong.
- **Proof links are evidence, not decoration.** The user's words: *"when I get asked how did you come up with this — I can do one click and it shows exact proof on CRM."* **A link whose count disagrees with the printed figure is worse than no link.** Reconcile before publishing; see `lookups/proof-links.md`.
- **Link by record id, never by embedding names or numbers** — keeps customer data off a shareable page.
- **Ask rather than assume.** The user would rather answer a question than receive a guess.
- **Persist findings to disk as they are produced, and commit alongside.** Do not leave results living only in the conversation.
- **UI:** dark navy sidebar, light workspace, white cards, blue accent, semantic green/red/orange, Inter and JetBrains Mono.

---

## Repo

```
lookups/
  wrong-number-paths.md   READ FOR STEPS 2-4 - the VoIP blind spot, validated
  proof-links.md          HubSpot link feasibility, the 238 existing lists
  cube-build.md           how the 6,849-record cube was built and reconciled
  source-fields.md        four disagreeing source fields, plus query traps
  property-notes.md       property inventory, pipeline and duration traps
  cube-partitions.tsv     the 17 partitions used for the lead pull
  daily-disqualified-counts.tsv
  hubspot-lists.csv       238 existing lists with ids, sizes, live/static
  industry-map.json  owners.json  teams.json  call-dispositions.json
snapshot/
  dashboard.html          the report - rebuilt, not yet published live
  cube.js                 6,849 records - publish as a separate file
server/  scripts/         superseded; scripts/*.js will not run (no node)
SUMMARY.md                pre-v3 written analysis; the page is more current
```

`scripts/output/` is gitignored — it holds real customer phone numbers.

---

## Framing for steps 4–6 — decided by the user 17 Sep 2026

**Do not re-query any of this. Every figure below is already computed and committed** (`02f1f99`, detail in `lookups/wrong-number-analysis.md`). The user's instruction: *"if you have existing data about something I ask to change at any time, it's better to use existing ones — new data to verify and build new mainly."* Query only to verify an existing number or to build something genuinely new.

### How the user wants wrong numbers presented

Show both detection paths, sum them, then deduct the contacts common to both:

| | Contacts |
|---|---:|
| Path A — logged by **lead stage** / disqualification reason | 2,394 |
| Path B — logged by **call outcome** (disposition) | 4,392 |
| Sum of both | 6,786 |
| Less those flagged by both | −1,444 |
| **Combined wrong numbers** | **5,342** |

The report currently shows 2,394, which is **44.8% of the combined figure**. Path A alone misses 2,948 contacts; path B misses 950. The two agree on only 27% of the union.

Path B's 4,392 **exactly equals** the live HubSpot list `Wrong Number Contacts` (list id 267) — so that row gets a gold-grade proof link to a list RevOps already maintains. Link: `https://app.hubspot.com/contacts/25308329/objectLists/267`

### Enrichment buckets, of the 5,342

| Numbers held | Contacts | |
|---|---:|---|
| 0 | 560 | **needs enrichment** |
| 1 | 1,921 | **needs enrichment** |
| 2 | 2,805 | may still be reachable |
| 3 | 56 | may still be reachable |

**2,481 (46.4%) need enrichment outright; 2,861 (53.6%) may still be reachable.** `phone_number_2` is populated on only 2.4% of flagged contacts, so it is not a real third channel — the user's original "one of two" framing was right.

### No team split — combine, and never double-count

The user is **not confident** in the BDR/SDR attribution and has asked that the page **not** split wrong numbers by team. Combine them, and make sure no total double-counts.

- Report the **combined** figure, **5,342**. Never present 6,786 — the raw sum — as a total anywhere on the page.
- The two mechanisms belong in the explainer as derivation detail only: logged by lead stage (2,394), logged by call outcome (4,392), less 1,444 contacts flagged by both.
- **Do not attribute either mechanism to BDR or SDR.** The mapping is unconfirmed and the data cannot settle it — `hs_call_source` is blank on all 5,508 non-VoIP wrong-number calls.
- Any further figure built on these paths must use the deduplicated union as its base, never the sum.

**5,342 is a floor, not a total.** A call source named "Integrations Platform" carries 34,534 calls and 81% of all Busy yet only 24 wrong numbers, so whichever tool that is is not recording wrong numbers as such. Say this on the page rather than implying 5,342 is complete.
