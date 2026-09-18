# Property inventory — confirmations and traps

Pulled live from portal 25308329 on 2026-09-16. This is the reference for every later phase.

**Scope note:** LEAD was dumped in full (146 properties). CONTACT, COMPANY and DEAL were interrogated by targeted search rather than full dump — a complete dump of CONTACT alone runs to several hundred properties and would have to route through the conversation to be written down. Every property the spec asked to confirm is covered below. Say the word if a full dump of the other three is wanted.

---

## Confirmed: the properties the spec asked about

| Need | Property | Status |
|---|---|---|
| Lead stage | `hs_pipeline_stage` on LEAD | **Found — but see the three-pipeline trap below** |
| Deal stage history | `hs_v2_date_entered_*` on DEAL | Found; ever-entered analysis is possible |
| Business start date | `founded_year` on COMPANY | **Found and well populated — 34,279 of 47,359 (72.4%)** |
| Last activity, contact | `notes_last_updated` (Last Activity Date), `notes_last_contacted` (Last Contacted) | Both found |
| Last activity, lead | `hs_last_activity_date`, `hs_last_engagement_timestamp` | Found |
| City, contact | `city` — a clean dedicated field | Found, not buried in free text |
| Street, contact | `address` | Found, separate from `city` |
| City, company | `city` | Found |
| `lead_generation_tag_placeholder` on other objects | CONTACT only | **Not on LEAD** — confirmed absent |

### `founded_year` is the finding the spec expected to be missing

The spec anticipated this field might not exist and said its absence would itself be a finding. It exists **and is populated on 72.4% of companies**, which makes it the best-covered qualification field in the database — better than `industry` at 75.6%, and far better than company `phone` at 60%.

That makes it usable today as an eligibility pre-screen, without enrichment spend.

---

## Trap 1 — there are three lead pipelines, with overlapping stage names

`hs_pipeline_stage` returns 24 options spanning three separate pipelines:

| Pipeline | Example stages |
|---|---|
| **Canopy Lead Stages** | Lead (1st Discovery call), 2nd Discovery call, Interested, Future Prospect, Converted, Not Interested, Disqualified, Do Not Contact, No Answer |
| **Inbound Lead stage** *(trailing space in the name)* | New, Attempting, Connected, Qualified, Disqualified, Future Prospect, Needs Followup |
| **(Do not use) Lead pipeline** | New, Attempting, Connected, MQL, SQL, Opportunity, Customer, Lost |

**Labels collide across pipelines.** "Disqualified" exists in two, "New" / "Attempting" / "Connected" in two, "Future Prospect" in two — one of them with a trailing space.

**Consequence:** grouping leads by stage *label* silently merges distinct stages from different pipelines. Every stage query must group on `hs_pipeline` as well, or filter to one pipeline explicitly. This is a strong candidate explanation for the unresolved lead-total contradiction (~49,650 by stage against ~35,300 by owner).

## Trap 2 — deal stage IDs do not mean what they say

On DEAL, the stage-history properties carry HubSpot's default IDs but custom labels:

| Internal ID | Actual label in this portal |
|---|---|
| `closedwon` | **"Offer Sent"** |
| `closedlost` | **"Signed"** |
| `decisionmakerboughtin` | "Signup completed" |

Any query written as `dealstage = 'closedwon'` expecting closed-won returns Offer Sent instead. This affects any reporting built on this portal, not only this project.

## Trap 3 — call duration is in milliseconds

`hs_call_duration` is documented as milliseconds. The spec's "under ~30 seconds" voicemail heuristic written as `30` would be wrong by a factor of 1000. In any case a dedicated `hs_call_has_voicemail` boolean exists, so the heuristic is not needed.

## Trap 4 — `LIKE` does not work on phone fields

Confirmed earlier in this project: `phone LIKE '%NNNNNNNNN%'` returns empty even for numbers known to exist, while `phone = '+971NNNNNNNNN'` returns the record. HubSpot normalises stored numbers to `+971…`, so exact matching on the normalised form is valid and `LIKE` must not be used on phone fields.

---

## Useful properties found that the spec did not ask for

These remove work from later phases:

| Property | Object | Why it matters |
|---|---|---|
| `hubspot_team_id` | LEAD | The owner's primary team, directly on the lead. Team filtering does not need a join through the owner lookup. |
| `hs_lead_time_to_first_outreach` | LEAD | Speed-to-lead, precomputed. Phase 4.2 asked for this to be derived. |
| `hs_lead_first_outreach_date` | LEAD | First touch timestamp, precomputed. |
| `hs_lead_call_count` | LEAD | Calls per lead without aggregating CALL engagements. |
| `hs_lead_meeting_count` | LEAD | Feeds "how many meetings to close". |
| `hs_lead_outreach_activity_count` | LEAD | Total touches, feeds "touches before first connect". |
| `call_attempts`, `first_connected_call`, `call_outcome`, `calling_stage` | LEAD | Custom call-tracking fields already maintained on the lead. Worth checking how populated they are before building the call analysis from engagements. |
| `hs_v2_time_in_current_stage` | LEAD, DEAL | Time in current stage, precomputed. |

**Caveat:** all of these are *present*. None has been checked for population. That check belongs at the start of the phase that uses them — a precomputed field that is 95% empty is worse than deriving it.

---

## Lead disqualification reasons — full option list

17 options. Counts as at 2026-09-16 across 6,849 leads carrying a reason.

`Wrong Number` · `Below minimum revenue` · `Insufficient Information` · `Left the Company` · `No Decision-making Power` (stored as `NO_DECISION_MAKING_POWER`) · `Outside UAE` · `Prohibited industry` · `Too Big` · `Existing Client` · `In talks with another POC` · `Below minimum years in operation` · `Company Closed` · `Broker` · `Not Interested` (stored as `NO_INTEREST`) · `Do not Contact Again` · `No Answer (Inbound)` · `bounce cheques`

Three values store differently from their label — `NO_DECISION_MAKING_POWER`, `NO_INTEREST`, and `bounce cheques` (lowercase, apparently added ad hoc). Filter on the stored value, display the label.
