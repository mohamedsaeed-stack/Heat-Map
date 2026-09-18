# Proof links — feasibility verdict

Checked live against portal 25308329 on 17 Sep 2026. The goal: every figure on the report links to proof in the CRM, so a challenged number can be defended in one click.

---

## 1. The two engines agree — reconciliation is achievable

`hs_lead_disqualification_reason = 'Wrong Number'` returns **2,422** from `query_crm_data` and **2,422** from `search_crm_objects`, which is the API the UI list views use. Exact agreement on a lead-native filter.

This was the main risk and it is retired: HubSpot's own filtering reproduces the query API's numbers, so a link **can** be made to show the same figure the page prints.

**Note the drift:** the published page says 2,421. Live is 2,422. One lead was disqualified since the snapshot. Every figure must be refreshed at rebuild time, and the page should carry the as-of date.

## 2. Creating lists is not available

`OBJECT_LIST` has `readAccess: AVAILABLE` but **`writeAccess: REQUIRES_PERMISSION_MODIFICATION`**.

So building a saved list per figure is blocked by the connector's own permissions, not merely by this project's read-only rule. Lifting the rule alone would not make it work — it would need a HubSpot permission change. Treat that option as closed unless the user pursues it deliberately.

## 3. But 238 lists already exist, and they are readable

Full inventory in `hubspot-lists.csv` (top 200 by size; the remaining 38 all hold 4 records or fewer, so they carry no proof value).

URL for any list — stable, one click, and the page shows the list's own count:

```
https://app.hubspot.com/contacts/25308329/objectLists/{hs_list_id}
```

**This is the best available route.** Pointing at a list RevOps already maintains is stronger proof than a link this project constructs, because it is the team's own definition rather than an outside claim.

### Candidates matching report figures

| List | Id | Records | Live? | Object |
|---|---:|---:|---|---|
| `7.1.1- Disqualified Lead- Wrong Number` | 325 | **2,423** | live | contacts |
| `7.2.1- Disqualified- Wrong Number` | 320 | 2,352 | live | companies |
| `Wrong Number Contacts` | 267 | 4,392 | live | contacts |
| `1.6- Wrong Number- Don't Contact Again Calls` | 341 | 5,046 | live | contacts |
| `1.4- Contacts generated from the App and unassigned to an owner` | 216 | 1,783 | live | contacts |
| `Inbound Disqualified` | 2501 | 3,019 | live | contacts |
| `Inbound Leads` | 2124 | 5,170 | live | contacts |
| `Smartlead List` | 862 | 719 | static | contacts |
| `unenriched industry` | 1039 | 5,732 | static | companies |

`7.1.1` at 2,423 against this project's 2,422 is within one record of the figure — the closest thing to gold-grade proof available, and it is a live list.

## 4. Four different "wrong number" totals — a finding in its own right

The same concept is tracked in four places and they do not agree:

| | Records |
|---|---:|
| Lead disqualification reason (this project's figure) | 2,422 |
| `7.1.1- Disqualified Lead- Wrong Number` (contacts) | 2,423 |
| `7.2.1- Disqualified- Wrong Number` (companies) | 2,352 |
| `Wrong Number Contacts` | 4,392 |
| `1.6- Wrong Number- Don't Contact Again Calls` | 5,046 |

These measure different things — lead disqualification, company-level rollup, a contact flag, and a call disposition. Anyone picking a list by name alone would attach the wrong one to the figure and lose the argument. **Match on reconciled count, never on name.**

## 5. Two hard limits on what can be linked

- **Only one lead list exists** in the whole portal (an unnamed 382-record segment). Lead-object lists are effectively unused, so proof links for lead-based figures will point at **contact or company** lists, whose unit differs from the figure's. Every such link needs its unit gap explained.
- **Cross-object conditions cannot be expressed.** `search_crm_objects` filters associations by record **ID only**, not by an associated object's properties. So "leads whose contact carries tag X" and the callable waterfall's `COMPANY.name IS NOT NULL` have no ad-hoc URL equivalent. Those figures cannot get a filtered-list link built from the API.

## 6. One thing still unknown

A list's **size** is readable; its **filter definition** is not exposed. So a list whose count matches might still be defined differently, and matching counts is suggestive rather than conclusive. Before publishing a gold link, the user should eyeball that list's definition in HubSpot once — `7.1.1` is the one that matters most.

---

## Recommended shape

| Grade | Applies to | Mechanism |
|---|---|---|
| **Gold** | Wrong number, app-signup-unassigned, Smartlead, inbound cuts | Link to the reconciled existing live list |
| **Silver** | Source, industry and owner cuts; callable waterfall | Example record — IDs come free from the cube pull |
| **Bronze** | Connect rate, meetings→funded, deal funnel | Print the exact query in the explainer |

Never publish a link whose count has not been reconciled against the printed figure, and state the unit whenever the link's object differs from the figure's.
