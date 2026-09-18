# How source is recorded — four fields that disagree

Pulled live from portal 25308329 on 2026-09-16. **Read this before building anything that groups by source.**

Four separate fields claim to describe where a contact came from. They measure different things, they disagree, and no single one is complete.

---

## 1. `lead_generation_tag_placeholder` — the tag

14 values, **53.4% blank** (38,302 of 71,680).

| Value | Contacts |
|---|---:|
| *(blank)* | 38,302 |
| Self Generated- Commercial Team | 15,004 |
| Lead Generation Team- Lusha | 11,913 |
| Sign Up | 5,028 |
| Smartlead (Smartlead Email Campaigns) | 1,378 |
| Inbound- Paid Ads- Facebook | 32 |
| Heyreach campaign | 15 |
| Outbound- Emails | 9 |
| Broker · Website Submission | 6 each |
| Ai Agent | 5 |
| Inbound- Paid Ads- Instagram · Linked Automated Campaigns | 3 each |
| Inbound- Paid Ads- LinkedIn | 2 |

Note the stored value is `Linked Automated Campaigns`, not "LinkedIn Automated Campaigns".

**Adoption began 2025 Q3.** Before that the field is almost entirely blank; the handful of 2022–2024 tagged records look backfilled.

**Blank is not a legacy problem.** 23,571 of the 38,302 untagged contacts (61.5%) were created in 2026 — after the tag was in use. Tagging is failing on an ongoing basis, not just historically.

## 2. `lead_source` — 25 values, **73.7% blank**

Captures sources the tag has no value for at all:

| Value | Contacts | Of which untagged |
|---|---:|---:|
| Leads sheet | 6,792 | 6,734 |
| **App signup** | **6,601** | 1,221 |
| Lead Generation | 1,651 | 1,594 |
| Deliveroo database | 1,286 | 1,276 |
| Ayush network | 732 | 707 |
| Instagram Ads | 581 | 566 |
| Lead Machine | 415 | 285 |
| Cognism | 256 | 218 |
| Smartlead - Email | 198 | 0 |
| Growdash | 118 | 114 |
| Google Ads 63 · Facebook ads 46 · Referral 41 · Speak to Expert 36 · Heyreach 15 · Amazon Seller Society 8 · LinkedIn Sales Navigator 8 · Lusha 5 · Telr 4 · Dubai List Leads 3 · Event 3 · Syrve Leads 3 · Broker 2 · Email 2 · Revly Leads 2 | | |

### Inbound is undercounted by the tag

`lead_source = App signup` is **6,601**. The tag's `Sign Up` is **5,028**.

1,221 app-signups carry no tag; 365 carry a different tag. Reporting inbound from the tag alone **understates it by roughly 1,573 records** — and inbound is the cleanest source in the database on phone accuracy.

## 3. `lead_sources` — labelled "Lead Source (Lusha Sync)"

Two values only: **Lusha 29,420**, blank 42,286.

Cross-tabbed against the tag, `lead_sources = Lusha` breaks down as:

| Tag on those records | Contacts |
|---|---:|
| Lead Generation Team- Lusha | 11,858 |
| **Self Generated- Commercial Team** | **14,723** |
| *(blank)* | 2,294 |
| Smartlead | 387 |
| Sign Up | 140 |

**98.1% of "Self Generated" contacts carry this flag.** Unresolved whether it marks provenance (the tool found the record) or merely contact (the tool enriched it at some point). That distinction decides whether the commercial team's numbers come from that tool or just passed through it. **Needs someone who knows the workflow.**

## 4. `hs_object_source_label` — how the record was created

Not a lead source. This is the mechanism of creation.

**Contacts:** INTEGRATION 35,960 · IMPORT 19,046 · CRM_UI 9,607 · FORM 4,869 · EXTENSION 1,826 · EMAIL_INTEGRATION 278 · PRESENTATIONS 47 · MOBILE_IOS 34 · BCC_TO_CRM 29 · MEETINGS 18 · CONVERSATIONS 11 · MOBILE_ANDROID 10 · INTERNAL_PROCESSING 8 · CHATSPOT 3

**Companies:** INTEGRATION 18,986 · **CRM_SETTING 15,213** · IMPORT 11,652 · CRM_UI 1,502 · MOBILE_IOS 55 · CHATSPOT 4

---

## Free email domains — and why they explain the orphan contacts

| | Contacts |
|---|---:|
| Free-domain email (gmail, hotmail, yahoo, icloud, outlook, live, me, aol …) | **9,752** |
| Of those, **no company attached** | **8,031 (82.3%)** |

**8,031 of the 13,033 unattached contacts — 62% — use a free email domain.**

**The mechanism.** 15,213 companies were created via `CRM_SETTING` — HubSpot auto-creating a company from the contact's email domain. It cannot do that for gmail.com, because every Gmail user would collapse into one company. So free-domain contacts never receive an auto-created company.

This is a structural consequence of portal configuration, not a data-entry failure. It also means "no company attached" is partly a proxy for "signed up with a personal email", which is itself a proxy for a small owner-run business — exactly the target segment.

Domain counts: gmail 7,840 · hotmail 728 · yahoo 598 · icloud 227 · outlook 197 · live 55 · me.com 19. A further 17,644 contacts have no email domain recorded at all.

---

## Open questions — do not guess at these

Decided with the user: **use the tag where present, fall back to `lead_source` where it is not, and label unknown sources by their raw name without interpretation.**

Still unanswered:

1. **What is "Leads sheet"** (6,792, the second-largest source)? A manual spreadsheet import would make it a delivery mechanism rather than a source.
2. **What are Deliveroo database, Ayush network, Growdash, Syrve Leads, Revly Leads, Telr, Amazon Seller Society, Dubai List Leads?** Partner data shares, purchased lists, or scraped?
3. **Cognism** (256) — a second contact-data vendor. Still in use?
4. **Lead Machine** (415) — what is it?
5. **"Lead Generation"** (1,651) versus the tag's "Lead Generation Team- Lusha" — same team, different tool?
6. Does `lead_sources` mean provenance or contact?

---

## Query notes

Confirmed live on 2026-09-16. Each of these produces a wrong answer with no error raised.

- Cross-object grouping (`SELECT CONTACT.x FROM LEAD GROUP BY …`) works and is how the source cross-tab was produced.
- **A `GROUP BY` combined with an association filter silently undercounts** — 85% low in one measured case, with no error. Use separate direct counts per value instead.
- **Every result caps at 500 rows and truncates silently — record-level selects included, not only grouped ones.** A pull of October's disqualified leads reported `Showing 500 of 1329 total results`. The trailing "of N" is the only warning you get, so read it on every query.
- **Cross-object record selects fan out on multi-association records.** `SELECT … CONTACT.x, COMPANY.y FROM LEAD` returns *one row per associated record*, not one per lead. October holds 1,227 disqualified leads but returns **1,329 rows**. In a 500-row sample, 16 lead IDs appeared twice — and **6 of those 16 disagreed on industry**, because the lead is attached to two companies in different sectors.

  Consequence: any aggregate built from a record pull must deduplicate on `hs_object_id` first, or it overstates by roughly 8% — and unevenly, since fan-out tracks duplicate company records rather than being spread at random. Dedup is lossless for owner, reason and source (all consistent across the duplicate rows); for industry it is a genuine choice between two real values, so the rule used must be stated and the affected count disclosed.

- **`DATE_TRUNC(prop, 'DAY')` over an open date range is silently rewritten to `'YEAR'`.** A daily histogram of all 6,849 disqualified leads came back as two rows — 2025 and 2026 — with a note saying the frequency had been overwritten "to fit all the data in the report". Daily or weekly buckets require an explicit `BETWEEN` range in the same query.

### Sizing a partitioned record pull

Two limits pull in opposite directions, and the workable band between them is narrow:

| Limit | Effect |
|---|---|
| 500 rows | Above this the result truncates silently |
| ~50,000 characters | **Above** this the result spills to a file instead of returning inline |

Spilling is what you want: a file costs almost nothing, while an inline result of a few hundred rows is the single largest avoidable token cost in this project. At roughly 110–125 characters per row, a partition of **450–480 rows** clears the spill threshold while staying under the cap.

A four-dimension record pull (source × industry × owner × reason) over all 6,849 leads is ~7,400 rows after fan-out, so it needs **16–18 date partitions**. Monthly counts of disqualified leads, for placing the boundaries:

| Month | Leads | Month | Leads |
|---|---:|---|---:|
| 2025-08 | 157 | 2026-03 | 843 |
| 2025-09 | 643 | 2026-04 | 954 |
| 2025-10 | 1,227 | 2026-05 | 665 |
| 2025-11 | 483 | 2026-06 | 296 |
| 2025-12 | 299 | 2026-07 | 142 |
| 2026-01 | 654 | 2026-08 | 148 |
| 2026-02 | 277 | 2026-09 | 61 |

Sums to 6,849 exactly, so no month is truncated. Include `CONTACT.lead_source` alongside `CONTACT.lead_generation_tag_placeholder` in the pull — it widens the row enough to help clear the spill threshold, and it is the field the layered source definition needs anyway.

### Local aggregation

**`node` is not installed on this machine** (checked 2026-09-16: not on PATH, not under Program Files, no nvm/fnm/volta/scoop install). `python` and `python3` resolve only to the Microsoft Store alias stub, which refuses to run. The committed `scripts/*.js` and `server/node_modules/` are left over from an earlier environment and are **not runnable as things stand**.

Aggregate with **PowerShell 5.1** instead — `Get-Content -Raw | ConvertFrom-Json`, `-split "\`t"`, `Group-Object`. Note its limits: no `&&`/`||`, no ternary, and `ConvertFrom-Json` has no `-AsHashtable`.
