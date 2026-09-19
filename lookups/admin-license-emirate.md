# The admin app's location is in the LICENCE NUMBER, not in `legalAddresses`

Measured 19 Sep 2026, after the FlapKap-Admin connector was restored.

## The brief's premise was wrong

`START-HERE.md` and `lookups/outstanding-book.md` both said the next move was to pull
`businessInfo.legalAddresses` per client, because that was believed to be the admin app's only
location field. **It is empty.**

Three funded (`REFINANCING`) clients sampled, all three with `legalAddresses: []`:

| Client | `legalAddresses` | `licenseNumbers` |
|---|---|---|
| Al Afdal Medical Center | `[]` | `741566 EDD-Sharjah` |
| Bonn Metals Const Ind LLC | `[]` | `623299 EDD-Sharjah` |
| Delman Shipping LLC | `[]` | `636960 DET-Dubai` |

`admin-fields.md` had already found it "empty on every rejected client sampled". It is now also
empty on every *funded* client sampled. Treat the field as unused.

## What works instead

**`businessInfo.licenseNumbers` names the issuing authority, and every UAE licensing authority is
emirate-specific.** It is on the same record, so it costs nothing extra once the record is fetched.

| Prefix / suffix | Emirate |
|---|---|
| `DET-Dubai`, `DED-Dubai` | Dubai (Dept. of Economy & Tourism) |
| `EDD-Sharjah`, `SEDD` | Sharjah (Economic Development Dept.) |
| `ADDED`, `DED-Abu Dhabi` | Abu Dhabi |
| `Ajman`, `AFZ` | Ajman |
| `RAK`, `RAKEZ`, `RAKICC` | Ras Al Khaimah |
| `Fujairah`, `FFZ` | Fujairah |
| `UAQ`, `UAQFTZ` | Umm Al Quwain |
| `JAFZA`, `DMCC`, `DAFZA`, `DWC`, `DSO`, `DIFC`, `IFZA`, `Meydan` | Dubai (free zones) |
| `SAIF`, `Hamriyah`, `SPC` | Sharjah (free zones) |
| `KIZAD`, `KEZAD`, `ADGM`, `Masdar` | Abu Dhabi (free zones) |

The full record also carries `website` and `phoneNumber`, both of which feed routes that already
exist here — the website locator and, for a `+9714`/`+9716`/`+9717` style number, the area code.

## Why this has NOT been run for all 372, and what it would cost

There is **no bulk route**. All three of these were checked:

- `flapkap_list_all_clients` — spills 11.7 MB to a file, and contains **no** `licenseNumbers`,
  `legalAddresses`, `website` or `phoneNumber`. Verified by grep against the saved spill.
- `flapkap_list_clients` (paginated) — same fields as the summary. No licence, no address.
- `flapkap_list_business_registration_places` — a reference list of emirates for credit checks,
  nothing per-client.

So it is one `flapkap_get_client` call per client, and each response is ~2.5–4K tokens **inline**;
these do not spill to a file.

**The cost is dominated by WHERE it is run, not by the calls themselves:**

| Run in | Cost for 372 clients | Why |
|---|---:|---|
| A long session (context ~600K) | **~220M tokens** | every call re-reads the whole conversation |
| Several fresh agents, ~80 each | **~70M tokens** | small context each, results written to disk |
| A fresh session doing nothing else | **~20M tokens** | context stays small throughout |

372 responses is also ~1.3M tokens of content on its own, which **will not fit in one context
window**. It must be split whichever way it is run.

## The recommendation

**Run it in a fresh session, as the first thing that session does.** Same work, roughly a tenth of
the cost of doing it at the end of a long one. Have it write `{businessId, emirate, licence,
website, phone}` straight to `raw/admin-licence-emirate.json` and nothing else into the
conversation.

**And be clear about what it buys:** an **emirate**, which is the coarsest pin the map draws. It
would take funded clients on the map from 46 toward 372, which matters because those are the
closed-won records — but it will not produce a street-level pin for any of them. The website and
phone number on the same record are the better follow-on, because those can reach an area.
