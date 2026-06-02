<!--
─────────────────────────────────────────────────────────────────────────────
Copyright (c) 2026 Geoffrey Oketwangwu (asatlabs.org)
Author:  Geoffrey Oketwangwu <geoffreyoketwangwu@gmail.com>

CONFIDENTIAL AND PROPRIETARY

This source file is the original work of Geoffrey Oketwangwu and contains
confidential, proprietary information protected under copyright and trade-
secret law. No part may be reproduced, distributed, modified, reverse-
engineered, or used — in source or compiled form — without the prior
written permission of the author.

All rights reserved.
-->
# 02 — Connecting to Government Systems

This document answers: *"How do you actually connect to NIRA, URA, URSB and the mobile-money networks?"*

## The switchboard idea (adapters)

Every outside system Sente Rails talks to — the national ID registry, the tax authority, MTN, Airtel — has its own quirky, incompatible interface. If the rail spoke each one's language directly, it would be a tangle.

Instead, Sente Rails uses **adapters**. An adapter is a small, swappable plug that fronts exactly one outside system and hides its quirks behind a clean, standard shape. The rest of the rail never knows whether it's talking to MTN or Airtel, to NIRA or a placeholder — it just asks the adapter, and the adapter deals with the mess.

> **Mental image:** Sente Rails is a switchboard with labelled sockets — "identity", "payment", "tax receipt", "business registry". Each socket can hold a different plug (adapter). To connect to a new provider, you make a new plug and push it in — you don't rewire the switchboard.

```
              ┌─────────────────── SENTE RAILS ───────────────────┐
              │                                                   │
  the rail    │   IDENTITY socket  ──[ NIRA adapter ]─────────────┼──► NIRA
  asks a      │   PAYMENT socket   ──[ MoMo / Airtel / Pesapal /  ┼──► MTN · Airtel · Pesapal
  labelled    │                       Cash adapters ]            │
  "socket";   │   FISCAL socket    ──[ EFRIS adapter ]────────────┼──► URA / EFRIS
  the plug    │   REGISTRY socket  ──[ OBRS adapter ]─────────────┼──► URSB
  (adapter)   │   LAND socket      ──[ LIS adapter ]──────────────┼──► Ministry of Lands
  does the    │   GATEWAY socket   ──[ UGHub adapter ]────────────┼──► NITA-U UGHub (bus)
  real        │   SMS socket       ──[ SMS adapter ]──────────────┼──► SMS provider
  talking     │                                                   │
              └───────────────────────────────────────────────────┘
                 each plug reports:   ● live    ◐ sandbox    ○ unavailable
```

This is why the system can grow agency by agency, and country by country, without rebuilding the core.

## The sockets (what kinds of systems it connects to)

| Socket | What it does | Real Uganda system |
|--------|--------------|--------------------|
| **Identity** | Look up a person by national ID | **NIRA** — National Identification & Registration Authority |
| **Payment** | Move the money | **MTN MoMo**, **Airtel Money**, **Pesapal** (cards/bank), and **Cash** |
| **Fiscal** | Issue a tax receipt | **URA EFRIS** — the tax authority's e-receipting system |
| **Business registry** | Look up / register a company | **URSB OBRS** — the business registration bureau |
| **Land registry** | Look up a land title | **Ministry of Lands** Land Information System |
| **Gateway** | The official government data bus | **NITA-U UGHub** — brokers access to NIRA, URA, URSB, etc. |
| **SMS** | Text the citizen | **NITA-U SMS**, or a commercial sender |

## Three concrete connections

### (a) Looking up a citizen → NIRA

When Aciro types Akello's national ID number, Sente Rails asks the **identity socket** for Uganda. The adapter there is the **NIRA adapter**. It looks Akello up and returns her authoritative name, date of birth, and district — which anchors her bill to a real, single national identity. (See [The Citizen](03-the-citizen.md) for why this matters so much.)

In production this call is brokered through **NITA-U's UGHub** — the government's official interoperability bus — under an agency agreement. Today it runs on realistic placeholder data while that agreement is finalised.

### (b) Taking a payment → MTN / Airtel / Pesapal

When Akello pays, Sente Rails asks the **payment socket**, telling it the channel ("MTN MoMo"). It picks the matching adapter by the channels each one supports — MoMo for MTN, Airtel for Airtel, Pesapal as a catch-all that also covers cards and bank transfers. The adapter fires the "request to pay", and later confirms it. Critically, the adapter instructs the provider to **split-disburse straight to the government's collection accounts** — the money never lands in a Sente Rails account.

### (c) Issuing a tax receipt → URA / EFRIS

For services that need a formal fiscal receipt, the **fiscal socket** (the **EFRIS adapter**) does two things: it reserves a **PRN** (Payment Registration Number) from URA before payment, and after payment it issues an **FDN** (Fiscal Document Number) with a verification code and QR — the official URA receipt. Notably this happens **even for cash payments**: the rail digitises the *record*, not just the medium, pulling everyday market transactions into the formal taxable economy.

## "Live" vs "Sandbox" vs "Unavailable"

Every connection reports its own honesty status, and the public API shows it plainly:

- **Live** — real credentials are loaded; real traffic flows to the real system.
- **Sandbox** — the adapter works, but is running on safe placeholder data (no live credentials yet).
- **Unavailable** — the socket is named for an agency, but the plug isn't built yet (waiting on an agreement).

The beautiful part: **flipping from sandbox to live is a credentials change, not a code change.** You drop the real keys into the secure configuration, and the adapter reports itself "live" automatically. No re-engineering.

## The three integration *modes* (how an agency plugs in)

Different agencies relate to the rail in different ways. Each MDA is tagged with a **mode**:

- **Mode A — System of Record.** Sente Rails *is* the agency's collection system. Its clerks work directly inside the rail's Counter Stations. *(Gulu City Council's market desks are a Mode A picture.)*
- **Mode B — Integration / Orchestration.** The agency already has its own system, and Sente Rails calls *into it* (and can push events back). This is where per-agency connection settings come alive: the agency's endpoint URL, a webhook URL for pushing events back, and a reference to its stored credentials.
- **Mode C — Oversight Read Consumer.** Read-only bodies — the **Auditor-General**, the **Finance Ministry**, the **statistics bureau** — that *consume* data from the rail but never collect. What they can see is governed by explicit oversight permissions.

> **Don't confuse two things:** a **mode** (A/B/C) is about the agency's *relationship* to the rail. An agency's **integration status** (Live / Sandbox / Planned / Inquiry) is about how *mature* that connection is. They're independent — an agency can be "Mode B, Planned" (we intend to integrate with their system, not built yet) or "Mode A, Live" (running on the rail for real today).

## Per-agency connection settings (Mode B)

For an agency that runs its own system, four settings on its record do the connecting:

- **`treasury_account`** — *where the money settles.* The government collection account this agency's revenue is routed to. (This is settlement routing, not a password.)
- **`integration_endpoint`** — *the agency's own system's address* that the rail calls.
- **`push_webhook_url`** — *the reverse direction:* where the rail pushes events back to the agency (e.g. "this assessment was paid"). This also powers cross-agency propagation — when a business pays URSB, a rule can notify URA and NSSF.
- **`api_credentials_ref`** — *a reference, never the secret itself.* It points into a secure, encrypted store; the real keys never live on the agency record.

## Reality check — what's actually wired today

Being precise, because it matters for planning:

- **Genuinely live now:** **Cash** (a counter cash payment needs no outside system — the clerk *is* the collector; the rail just records it).
- **Built and one-flip-from-live** (real call code written; flip = load credentials): **MTN MoMo**, **Pesapal**, and the commercial **SMS** sender.
- **Deliberate placeholders, waiting on agency agreements (MoUs):** **NIRA**, **URA/EFRIS**, **Airtel Money**, **URSB**, **Lands**, the **UGHub** gateway, and the government **SMS** gateway. These return realistic fake data so the whole rail can be demonstrated end-to-end, and every placeholder response is tagged as such so nothing overstates its maturity.

The framework around all of this — the switchboard, the status reporting, the "never overstate maturity" honesty — is **fully built**. What remains for each connection is the institutional agreement and the credentials.

*(There is one small known gap to tidy when we do the workstation fine-tuning: the Cash plug exists and is correct but isn't yet registered in Uganda's payment socket list, so a "Cash" channel needs that one registration added. Noted for the fine-tuning phase.)*

---

*Next: [The Citizen](03-the-citizen.md) — what the person paying actually experiences.*
