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
# 07 — The MDA / Government Agency

**MDA** = **Ministry, Department, or Agency.** It's the government body that's actually owed the money — *Gulu City Council* for market dues, *URA* for tax, *URSB* for business registration, *NIRA* for ID services. The MDA is the centre of gravity in the whole rail: services are theirs, money settles to them, and oversight is organised around them.

An MDA isn't a person who logs in — it's an **entity** the rail is configured around. But understanding "what's in it for the agency" is essential to the whole story.

## How an agency sits in the rail (the schematic)

```
                         ┌──────────── MDA: Gulu City Council ────────────┐
                         │  mode: A   │  status: Live  │  treasury_account │
                         └────────────────────────┬───────────────────────┘
                                                  │ owns
                    ┌──────────────┬──────────────┼──────────────┐
                    ▼              ▼              ▼              ▼
               Service          Service        Service     (Fee Schedule:
            "Market Dues"    "Trading Licence" "Property…"   legal citation
             5,000/day        120,000/yr        …            + effective date)
                    │
                    │ a citizen is billed
                    ▼
               Assessment ─► Payment ─► Payment Event ─► MDA Settlement ─► TSA
                                                          │
                                  (cross-MDA push) ───────┘──► notify URA / NSSF …
```

## The three ways an agency can plug in (modes)

Not every agency relates to the rail the same way. Each MDA is tagged with a **mode**:

- **Mode A — System of Record.** The agency has no system of its own; **Sente Rails *is* its collection platform.** Its clerks work directly in the Counter Stations. *Gulu City Council's market desks are Mode A* — they got a ready-made digital collection system overnight.
- **Mode B — Integration.** The agency **already has its own system**, and the rail talks *to* it (and pushes events back). This is for larger agencies — a URA or URSB — that won't replace their core system but want to be on the rail. Their record carries the connection settings (their endpoint, a webhook-back URL, a reference to their credentials).
- **Mode C — Oversight Consumer.** Read-only bodies — the **Auditor-General**, **Finance Ministry**, **statistics bureau** — that *consume* data but never collect. Governed by explicit oversight permissions.

(See [Government Connections](02-government-connections.md) for how mode interacts with "integration status" — how mature that connection is.)

## What an agency gets

### 1. A collection system without building one
A Mode A agency like Gulu gets counters, citizen lookup, server-enforced pricing, multi-channel payments, receipts, and end-of-day reconciliation — without writing a line of code. They define their **services** and **fees**, assign **clerks**, and they're collecting.

### 2. Money that lands automatically — straight to Treasury
Every confirmed payment is routed to the agency's **treasury account**, and rolls up through **settlement** into the **Treasury Single Account**. The leak between "collected at the desk" and "received by Treasury" closes. The agency sees what it collected, in near-real-time, by service and by channel.

### 3. Fees that are official and auditable
Each service's fee is tied to a **fee schedule** with a **legal citation** (e.g. *"Local Government Act CAP 138, 5th Schedule"*) and effective dates. When the law changes, the schedule is versioned — so there's a permanent record of *what the fee was, when, and under what authority.* No clerk can deviate from it.

### 4. Interoperability with other agencies (cross-MDA)
This is the quietly powerful part. Because every payment is anchored to one national identity and the rail spans agencies:

- **One payment can settle several agencies.** A single transaction can route a Gulu market-due *and* a URA tax to two different government accounts — split automatically.
- **Events can cascade.** When a business pays URSB, a **propagation rule** can notify URA and NSSF — so registering a company can ripple into tax and social-security enrolment. Agencies stop being silos.

### 5. Built-in oversight and anti-fraud
The agency benefits from the same controls that protect citizens: server-set prices, immutable proof of every payment, mandatory reasons on cash discrepancies, automatic anomaly flags on suspicious drawers, and an independent auditor watching. Revenue integrity is structural, not a matter of trust.

## Worked example — Gulu City Council

Gulu comes on as a **Mode A** agency. The platform team sets up its record (mode A, status Live, treasury account), and Gulu defines its services: *Daily Market Dues (5,000/day)*, *Trading Licence (120,000/yr)*, each tied to its legal fee schedule. Clerks like Aciro are created and assigned to Gulu. From that point:

- Aciro collects from Akello; the 5,000 is recorded, proven, and routed to Gulu's account.
- Gulu's revenue rolls up nightly into settlements and on to the Treasury.
- Gulu's managers see live totals by service and channel; the Auditor-General sees Gulu's revenue alongside every other agency's.
- If Gulu later wanted a business-registration tie-in, a propagation rule could fan a payment out to URA — no new system required.

Gulu went from cashboxes and paper to a verifiable, straight-to-Treasury digital rail — without building software.

## Reality check

The agency model — MDAs, services, tiered/legal fee schedules, modes A/B/C, treasury routing, settlement, and cross-MDA propagation rules — is **built into the data model and the flow**. Onboarding a new agency today is a configuration task (define the agency, its services/fees, its clerks) done by the platform admins through the Operations Console. The live *external* connections for Mode B agencies (calling URA's or URSB's own systems) ride on the adapter layer and await their MoUs (see [Government Connections](02-government-connections.md)).

---

*Next: [The Platform Admin](08-the-platform-admin.md) — who runs the rail itself.*
