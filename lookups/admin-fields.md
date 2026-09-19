# FlapKap admin app — field probe

Probed 19 Sep 2026 with a read-scope session. **Field names only.** No merchant name, balance,
trade-licence number, phone or email from this probe is recorded here or anywhere in the repo.

## The four questions, answered

### 1. What identifies a client's location?

**`businessInfo.legalAddresses`** — the trade-licence address, an array on the *full* client record.
Nothing else carries a location:

| Field | Value |
|---|---|
| `businessInfo.country` | `ARE` only. No city, no emirate. |
| `businessInfo.legalAddresses` | present on the full record, **empty on every rejected client sampled** |
| client summary (`flapkap_list_all_clients`) | carries **no address field at all** |

This is the brief's worst case: free text, and only on the per-client endpoint. Reading it for all
8,534 clients would cost 8,534 separate API calls.

**Consequence for the map:** the admin app says *who is a real client*; HubSpot says *where they
are*. The two are joined by company name (`scripts/match-admin-clients.js`).

### 2. Is there an industry field?

**Yes, and it is far cleaner than HubSpot's.** `classifications.INDUSTRY`, **35 values** against
HubSpot's 130, plus `BUSINESS_TYPE` (B2B/B2C) and `SALES_CHANNEL` (RETAIL, E_COMMERCE, …).

Largest values: SERVICES 1,454 · TRADING 820 · OTHER_SERVICES 319 · CONSTRUCTION_CONTRACTING 249 ·
OTHER_TRADE 228 · MANUFACTURING 205 · IT_SOFTWARE_DATA 180 · FOODSERVICE_HOSPITALITY 170.

**IT_SOFTWARE_DATA at 180 clients settles the open question in PLAN.md:** IT and software is a real
segment and deserves its own category.

### 3. Where does the outstanding balance live?

**Not on the client record.** It needs `flapkap_get_credit_balance`, `flapkap_get_financials` or
`flapkap_get_statements`, each per client. Not pulled: the map does not need money per merchant, and
balances are the most sensitive field in the system. The outstanding-book view stays for later, and
should aggregate by area before anything is drawn.

### 4. Token cost of one page

| Call | Rows | Result |
|---|---:|---|
| `flapkap_list_clients` | 3 | inline, ~2,600 characters, about 900 per client |
| `flapkap_get_client` | 1 | inline, ~2,900 characters |
| `flapkap_list_all_clients` | 8,534 | **11,747,804 characters — spilled to a file** |

**The whole-environment call is the cheap one.** It costs one request and nothing in the
conversation, because the result spills to disk and is parsed there. A paginated crawl at 100 per
page would be 86 calls and would route every row through the conversation. Never paginate this.

## Status values that matter

`financingStatus` has only two values: **NEW 8,162** and **REFINANCING 372**.

REFINANCING is the only reliable funded signal on the summary: a client refinancing has been funded
at least once. There is no DISBURSED or FUNDED status here, so 372 is a **floor** on funded clients,
not the total.

`businessInfo.status`: ACTIVE 6,496 · AUTO_REJECTION 1,049 · OPEN 354 · LOST_IN_ACQUISITION 312 ·
POST_ANALYSIS_REJECTION 269 · CLOSED 54.

`LOST_IN_ACQUISITION` and `POST_ANALYSIS_REJECTION` are a **third loss taxonomy**, separate from
HubSpot's sales-lost and Risk-rejected. The brief warned about two; there are three.

## The join is weak, and that is the finding

| | |
|---|---:|
| Admin clients | 8,534 |
| HubSpot companies pulled | 18,866 |
| Exact name match | 561 |
| Fuzzy match at 0.72 or better | 42 |
| **Distinct HubSpot companies matched** | **718 (8.4%)** |
| Funded clients (REFINANCING) | 372 |
| **Funded clients matched to HubSpot** | **54 (14.5%)** |

The brief predicted this: *"HubSpot shows 127 deals at Money Disbursed against roughly 8,419 clients
in the admin app. The only link is a hand-typed field on the Deal object, missing on around 17% of
deals."* An 8% name-match rate is the measurement of that broken join, not a bug in the matcher.

**A funded client with no HubSpot match cannot be placed on the map**, because the admin app holds
no usable location. 318 of 372 funded clients are in that position today. Closing that gap needs
either the per-client `legalAddresses` pull or a `place_id` written back into both systems.
