# The outstanding book per area — measured, and why it is blocked

Status: **not built. Blocked on data, not on effort or tokens.** 19 Sep 2026.

The user chose the outstanding book (not disbursed, not fees) as the revenue metric for the map.
Before pulling a single balance, the question "what would this view actually show?" was answered
from data already on disk. The answer is: not enough to publish, and not safely.

## The three numbers that block it

| | |
|---|---:|
| Funded clients in the admin app (`financingStatus = REFINANCING`) | 372 |
| …that the name join reaches in HubSpot | **54** (14.5%) |
| …that can be placed on the map at all | **48** (12.9%) |

A balance we cannot place cannot go in an area total. So any "outstanding book by area" built today
describes **13% of the funded book** while looking like all of it. That is the kind of figure that
gets screenshotted into a deck and read as the real thing.

## And the 48 do not spread across areas

Where the 48 placeable funded clients actually sit:

| Clients | Where |
|---:|---|
| 40 | Dubai — **no area known**, emirate-level only |
| 2 | Dubai — Al Barsha |
| 1 | Dubai — Naif |
| 1 | Dubai — Al Fahidi |
| 1 | Sharjah — no area |
| 1 | Ajman — no area |
| 1 | Abu Dhabi — no area |
| 1 | Abu Dhabi — Al Ain City |

**Four areas have a funded client, and each has one or two.**

## Which makes it a disclosure problem, not just a coverage one

Balances are the most sensitive field in the system. Publishing "outstanding book in Al Fahidi" when
exactly one client is in Al Fahidi **publishes that client's balance**. Al Barsha with two clients is
barely better: anyone who knows one of the two can subtract.

An aggregate is only an aggregate if the cell is big enough to hide inside. These cells are not.
Rolling up to emirate does not rescue it either — Sharjah, Ajman and Abu Dhabi have one or two
clients each. Only Dubai, at 44, would be safe, and "Dubai" is not an area view.

## What is needed before this is worth building

Not more API calls. **A working join.** Any one of these unblocks it:

1. **Write a shared key into both systems** — a `heatmap_source_id` custom property on the HubSpot
   company and the matching field on the admin client. This is PLAN.md §9.4 and it is the real fix.
2. **Pull `legalAddresses` per client** from the admin app — one call each for 372 clients — which
   gives the funded clients a location of their own and removes the dependence on the HubSpot join
   entirely.
3. **Decide that an emirate-level book is enough**, in which case Dubai alone can be shown, with the
   other emirates suppressed for having too few clients to aggregate safely.

## The cost, if the user wants it anyway

Measured, so the decision is informed. There is **no bulk endpoint** — `flapkap_get_credit_balance`,
`flapkap_get_financials` and `flapkap_get_stats` each take a single `businessId`.

| Scope | Calls | Tokens | What you get |
|---|---:|---:|---|
| The 48 placeable clients | 48 | ~14M | One safe number: Dubai. Everything else suppressed. |
| All 372 funded clients | 372 | ~110M | The true total book, but still only 48 of them mappable. |

**Recommendation: do not spend either until the join is fixed.** Option 2 above is the better
purchase — the same ~372 calls that would buy balances would instead buy *locations*, which is the
thing actually missing, and would raise placeable funded clients from 48 toward 372.

## What was NOT done, deliberately

No balance was pulled. No merchant balance appears anywhere in this repo, in `data/`, or on the page.
The rule from `lookups/admin-fields.md` still stands: aggregate by area **before** anything is drawn,
and do not draw it at all if the cells are too small — which is exactly what this measurement found.
