# Stale deals: HubSpot still open, the admin app has already decided

Generated 2026-09-19 from the UAE coverage-map build.

**19 deals sit in an OPEN HubSpot pipeline for merchants the FlapKap admin app has already
closed.** The admin app is authoritative for won and lost (your decision, 19 Sep 2026), so each of
these is a HubSpot record that needs closing or re-opening deliberately.

This is a CRM data-quality item, not a map item. It is listed here because the map build is what
surfaced it: the two systems were joined by company name and then compared, record by record.

| Company | Emirate | HubSpot says | Admin app says | Stage | Owner | Deal value |
|---|---|---|---|---|---|---|
| Jeebly | Dubai | In process | **Closed won** | Offer Sent | Uzair Ali | AED 1,500,000 |
| MAD Hospitality | Dubai | In process | **Closed lost** | Sign Up Completed (SQL) | Menna Mohamed | AED 1,000,000 |
| ATS Travel | Dubai | In process | **Closed lost** | Final Offer Sent | Cameron Shilon | AED 1,000,000 |
| NG Beauty World FZCO | Dubai | In process | **Closed lost** (Risk) | Sign Up Completed | Jenane ElGazzar | AED 1,000,000 |
| MAGNARAB Equipment Trading L.L.C | Dubai | In process | **Closed lost** | Starts Uploading Documents | Baraa Shaarawy | AED 1,000,000 |
| New System Engineering | Dubai | In process | **Closed lost** | Starts Uploading Documents | Karim Ramy | AED 1,000,000 |
| The Lab Studios | Dubai | In process | **Closed lost** | Meeting Booked | Amr Roushdy | AED 1,000,000 |
| Triangle Power Solutions | Dubai | In process | **Closed lost** | Starts Uploading Documents | Karim Ramy | AED 1,000,000 |
| Saubhagya Global Metal | Dubai | In process | **Closed won** | Signup Completed | Uzair Ali | AED 750,000 |
| Medisouq | Dubai | In process | **Closed lost** | Sign Up Completed (SQL) | Menna Mohamed | AED 500,000 |
| Saniservice | Dubai | In process | **Closed won** | Offer Sent | Uzair Ali | AED 500,000 |
| Gravity Calisthenics Gym | Dubai | In process | **Closed lost** | Awaiting Signup | Omair Saleem | AED 500,000 |
| TIC Quality Control | Dubai | In process | **Closed lost** | Sign Up Completed (SQL) | Cameron Shilon | AED 500,000 |
| Tektiks Technologies | Dubai | In process | **Closed lost** | Meeting Booked (SAL) | Tommy Whyte | AED 500,000 |
| Nakashi Lighting | Dubai | In process | **Closed lost** | Sign Up Completed (SQL) | Cameron Shilon | AED 500,000 |
| Circolo | Dubai | In process | **Closed lost** | Starts Uploading Documents | Ciaran Rourke | AED 500,000 |
| Diverse Resourcing Group | Dubai | In process | **Closed won** | Ongoing Conversation | Waleed Shaikh |  |
| QuickSpares | Dubai | In process | **Closed won** | Signed | Qays Muhammad |  |
| Brambourne Group | Dubai | In process | **Closed won** | Awaiting Signup | Qays Muhammad |  |

**Total deal value sitting in these open records: AED 12,750,000.**

## How to read it

- *HubSpot says* is the deal stage mapped through lookups/stage-map.json.
- *Admin app says* is derived from the client record: financingStatus REFINANCING means funded;
  status LOST_IN_ACQUISITION, POST_ANALYSIS_REJECTION, AUTO_REJECTION or CLOSED means lost.
- The join between the two systems is by company NAME and matches only 8.4% of records overall,
  so this list is a floor. There will be more that the name match did not reach.

## The wider disagreement

169 companies disagree between the two systems in total. 19 of them are the urgent kind
(HubSpot open, admin decided). The rest are HubSpot showing a plain CRM record for a merchant the
admin app has already funded or rejected - less urgent, same root cause: nothing writes back.
