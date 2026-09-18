# FlapKap admin app — field probe

Purpose: answer the brief's open questions 1 and 3 before W2/W4 are designed.

1. What identifies a client's **location**? City field, trade-licence address, or free text?
2. Does the app carry an **industry** field?
3. Where does the **outstanding balance** live?
4. What does one 100-row page **cost in tokens**? (PLAN.md obstacle 9 — this sizes every later pull.)

**Field NAMES only in this file.** No merchant names, no balances, no trade-licence numbers, no
addresses. Nothing from this probe goes into the conversation or a published page either.

---

## Status: NOT RUN — connector unavailable

Probed 19 Sep 2026.

The `FlapKap-Admin` connector is listed for this session but reports status `pending` and exposes
**no tools at all**. This is a different failure from the one PLAN.md obstacle 1 recorded: that was
an authenticated connector returning `connection invalidated` on each call. Here the tools
`flapkap_auth_status`, `flapkap_login`, `flapkap_list_clients` and `flapkap_get_client` are not
present in the session, so there is nothing to call.

Every claude.ai connector on the account shows the same `pending` state, HubSpot included, so this
looks like a session-level connector problem rather than one specific to the admin app.

What was tried:

| Step | Result |
|---|---|
| List session connectors | 10 connectors listed, all `kind: connector`, all `status: pending`, none reporting a tool count |
| Enable `FlapKap-Admin` for the session | "already enabled; nothing changed" |
| Enable `HubSpot` for the session | "already enabled; nothing changed" |
| Search the deferred-tool registry for `flapkap_*` | no match |
| Search the deferred-tool registry for HubSpot query tools | no match |
| Reconnect the connector | refused: reconnect only applies to a server whose status is `failed` |

### To unblock

The connectors must come up as `connected` with a tool count. Re-authorising `FlapKap-Admin` on the
claude.ai Connectors page is still required per PLAN.md obstacle 1, but it is not sufficient on its
own while every connector in the session is `pending`.

---

## Findings

*(empty — fill in when the probe runs)*

| Question | Field name | Notes |
|---|---|---|
| Location | | |
| Industry | | |
| Outstanding balance | | |

### Token cost of one page

| Rows requested | Rows returned | Tokens for the call | Tokens per row |
|---:|---:|---:|---:|
| | | | |

Sizing rule to derive once measured: the largest page that still spills to file rather than
returning inline, mirroring the HubSpot rule in `START-HERE.md` of the audit repo.
