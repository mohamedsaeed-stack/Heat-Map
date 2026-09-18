# Start here — handoff for the next session

Read this, then `PLAN.md`. Read individual `lookups/` files only when a step needs them.

**Live page (private, republish to this same URL, never make it public):**
https://claude.ai/artifact/PYQb7axx5DtTWS8kYV47sv

---

## The one thing blocking everything

**No HubSpot and no FlapKap-Admin tools exist in this session.** Not "invalidated" as PLAN.md
obstacle 1 describes — simply absent. `flapkap_auth_status`, `flapkap_list_clients` and every
HubSpot query tool are not in the tool set, so there was nothing to call.

What was tried and what it returned:

| Step | Result |
|---|---|
| List session connectors | 10 connectors, every one `status: pending`, none reporting a tool count |
| Enable `HubSpot` / `FlapKap-Admin` for the session | "already enabled; nothing changed" |
| Search the deferred-tool registry for `flapkap_*` and for HubSpot query tools | no match |
| Reconnect the connector | refused — reconnect applies only to a server whose status is `failed` |

Every claude.ai connector shows `pending`, not just these two, so this reads as a session-level
connector problem rather than a stale grant on one app. **Check `session_connectors_status` first
thing: if the rows say `connected` with a tool count, the pulls below can run immediately.**

---

## Done, committed, do not redo

| | |
|---|---|
| Repo scaffold | `lookups/ scripts/ data/ page/`, `raw/` gitignored |
| `lookups/industry-map.json` | Retail split out as category 7. **Keep this version** — the copy on `main` is the unmodified audit one with RETAIL still inside manufacturing_trading |
| `lookups/dubai-communities.json` | 91 communities, 222 aliases, word-bounded longest-first matching |
| `data/communities.json` | **88 real OSM centroids.** No coordinate invented |
| `scripts/lib/communities.js` | Text-to-community matcher, 11-case self-test passing |
| `scripts/geocode-communities.js` | Nominatim, 1 req/s, place/boundary/landuse only |
| `scripts/build-meta.js` | Builds `data/meta.json`, cross-checks every total |
| `page/index.html` | The published page. Source of truth — build from it, do not read the artifact back |
| `lookups/stage-map.json` | **DRAFT. Not approved. No deal may be counted yet** |

### Two traps this session hit, so you do not

**Nominatim's first result is often not the place.** Accepting it gave Hatta a road 90 km from the
town, Al Fahidi a shop, Al Safa a metro station in the wrong district — 13 of 90 were transport
features, with no error raised. Only `place`, `boundary` and `landuse` are accepted now.

**The artifact viewer blocks external stylesheets.** Leaflet's CSS is inlined; its relatively
referenced marker images would 404, so the page uses `L.circleMarker` only. Scripts from cdnjs are
fine. The page tries three tile providers and uses the first that delivers, so no single blocked
provider breaks it.

---

## Next, in order

### 1. Get the stage map approved — before any deal is counted

`lookups/stage-map.json` has **six stages carrying `confirm: true`, holding 675 deals**. Ask the
user these, then set the layers and commit:

- **"Signed" (103 deals across three pipelines).** Proposed `open`, because PLAN.md defines closed
  won as *funded* and signing precedes funding. If a signature is the win, these move to `won`.
- **"Unworthy" (422 deals).** Proposed `lost_sales`. Reads more like *disqualified* than *lost*, and
  counting them as lost overstates the loss layer by 422. The alternative is `ignore`.
- **"Rejected Pre NOP" (115).** Proposed `lost_risk`. Nobody has expanded NOP.
- **"Expected NOPs" (36).** Proposed `open`.

### 2. Pull the CRM rows

Partitioned by `createdate`, **450–480 rows per partition** so each spills to file rather than
returning inline. Read the "Showing X of Y" line on every one; 500 is a silent cap. Aggregate from
the spilled files with Node — never route rows through the conversation.

Columns: `hs_object_id, name, industry, lifecyclestage, address, address2, zip, hubspot_owner_id,
createdate`.

Then deals in the four in-scope pipelines with `pipeline, dealstage, closed_lost_reason` (confirm
that property name with a property search first), `hubspot_owner_id, closedate` and the associated
`COMPANY.hs_object_id`. **Cross-object selects fan out — dedupe on deal id.**

### 3. Locate, then republish

Community match first (free, `scripts/lib/communities.js`), then Nominatim on the 5,335 companies
that have a street address — about 90 minutes unattended at 1 req/s, run as a background script
writing to `raw/`. Every layer records its unlocated count.

### 4. Widen to the UAE

The user asked for the whole UAE, not Dubai. The page already frames the UAE; the data does not.
See the scope table in `README.md` — city spellings per emirate, an area list per emirate, and the
counts re-run UAE-wide.

### 5. W2 onward

Universe from OpenStreetMap via Overpass (free), then the admin-app join for closed won and the
outstanding book. `lookups/osm-dubai-counts.tsv` already records which categories the free universe
can and cannot support, and that Overpass needs a real User-Agent and 5–10 s between requests.

---

## How the user wants this done

- **Publish after every change, and give them the link.** Same URL every time. Private always.
- **Data files stay separate from the page.** Inlining a large dataset makes every later read of the
  page cost tens of thousands of tokens — proven on the audit project.
- **No paid credits.** No Clay, Apollo, Lusha, Apify or Google Places. Overpass and Nominatim only.
- **Every figure carries an explainer**: how derived, what would make it wrong, what is unlocated.
- **Link by record id, never by embedding customer names or numbers in a shareable URL.**
- **Ask rather than assume** when readings differ materially; otherwise decide and write down why.
- **Persist findings to disk as they are produced.** Nothing lives only in the conversation.
- Check `get_usage` at the start and before every expensive step. Report measured percentages.
  Never quote a tokens-per-point rate. Stop at a safe point rather than spend past 98%.
- The map must look like a real map. The user was explicit: street-level basemap, not a blank canvas
  with dots on it.
