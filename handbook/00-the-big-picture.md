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
# 00 — The Big Picture

## The one-sentence answer

> **Sente Rails is a national rail for government revenue.** It lets any Ugandan pay any government fee through one consistent digital pipe, routes the money straight to the Treasury, issues a verifiable receipt, and gives every stakeholder — the citizen, the clerk, the agency, the auditor, and outside developers — their own safe window into it.

("*Sente*" means *money*.)

Think of it the way "rails" is used in fintech: **Sente Rails is to government revenue what a payment rail is to money** — the shared pipe everyone plugs into, instead of every agency building its own.

## The problem it solves

Today, collecting government revenue in Uganda is fragmented and leaky:

- **Every agency does it differently.** A market fee, a trading licence, a land-search fee, a passport payment — each sits in a different system, or in a paper ledger, or in a cashbox.
- **Cash leaks between the counter and the Treasury.** Money collected at a desk can quietly fail to reach the government account. There's no automatic, tamper-proof link between "citizen paid" and "Treasury received."
- **There's no single picture.** No one can easily answer "how much did Gulu collect in market dues this month?" or "did this person actually pay?"
- **Identity is soft.** Without one trusted national identity behind each payment, you get ghost taxpayers, duplicate charging, and revenue attributed to people who don't exist.
- **Citizens get a paper receipt that can't be verified.** If you lose it, or someone forges one, there's no way to check.

## What Sente Rails actually does

Sente Rails sits in the middle as a **switchboard**. It does four things — and deliberately does **not** do a fifth:

1. **Records** — every bill (an *assessment*) and every payment, as structured, permanent data.
2. **Prices** — it knows the government-set fee for each service, so the amount can't be fudged.
3. **Routes** — it instructs the payment provider to send the money straight to the right government account.
4. **Proves** — it keeps an immutable, auditable trail of what happened.

And the fifth thing, which it **never** does:

> **It never holds the money.** This is deliberate and legally important (Uganda's Public Finance Management Act forbids a middleman sitting on public funds). The cash moves from the citizen's mobile-money wallet or bank account **directly** to the government's collection account, via a licensed payment provider. Sente Rails records and routes — it is not a wallet.

A good mental image: Sente Rails is the **air-traffic control tower**, not the aeroplane. It tells the money where to go and logs every flight, but the money flies on the provider's own engines.

## Who it serves — the stakeholders

| Stakeholder | Who they are | What they get |
|-------------|--------------|---------------|
| **Citizen** | The person paying a government fee | One easy way to pay, a receipt anyone can verify, and their personal data protected |
| **Clerk** | A cashier at a government counter | A simple screen to look up a citizen, ring up the fee, take payment, and balance their drawer at end of day |
| **Supervisor** | The clerk's manager | A live dashboard of every counter, and sign-off control over cash discrepancies |
| **MDA / Agency** | A Ministry, Department, or Agency (e.g. Gulu City Council, URA, URSB) | A ready-made collection system, money landing automatically in their account, and cross-agency interoperability |
| **Integrator** | An outside developer or fintech | A public API to build apps that pay government fees — the way open banking unlocked fintech |
| **Platform Admin** | The team running the rail | Tools to onboard agencies, manage developers, and keep the system healthy |
| **OAG** | The Office of the Auditor-General | An independent, read-only window over all revenue — to spot fraud and verify consent |

## The three "front doors"

Everyone reaches the same rail, but through one of three doors built for them:

1. **Counter Stations** — the screen a **clerk** uses at a physical desk. *(Internally: the `/work` surface.)*
2. **The Developer Hub & public API** — what an **integrator's software** calls. *(Internally: the `/v1` surface.)*
3. **The Operations Console** — where **admins and the auditor** log in. *(Internally: the `/ops` surface.)*

Each door has its own kind of key (covered in [Who Can Do What](10-who-can-do-what.md)): clerks and admins sign in with a normal staff login; developers' software carries an API key.

## The whole picture in one diagram

How information flows, and where each stakeholder connects:

```
  STAKEHOLDERS           FRONT DOORS              THE RAIL (core)            OUTSIDE SYSTEMS
  ════════════           ═══════════              ═══════════════            ═══════════════

  Citizen ········(served; never logs in)···┐
                                            │
  Clerk ───────┐                            ▼
  Supervisor ──┴──► Counter Stations ─┐  ┌────────────────────┐
                      (/work)         │  │ 1. ASSESS  (bill)   │   ┌─► NIRA        (identity)
                                      │  │ 2. PRICE  (server)  │   │
  Integrator ─────► Developer Hub ────┼─►│ 3. PAY    (intent)  │──►│─► MTN / Airtel / Pesapal
   (software)         (/v1)           │  │ 4. PROVE  (event)   │   │     (payment)
                                      │  │ 5. SETTLE           │   │─► URA / EFRIS  (tax receipt)
  Admin ───────┐                      │  └─────────┬──────────┘   │
  OAG (read) ──┴──► Operations ───────┘            │              │─► URSB / Lands (registries)
                     Console (/ops)                │              │
                                                   │              └─ all via NITA-U UGHub bus
                                                   ▼
                                       Treasury Single Account  (via IFMIS)

  How each stakeholder connects:
     staff login  →  clerk · supervisor · admin · OAG
     API key      →  integrator software
     national ID  →  citizen (looked up, never logs in)
```

The five numbered steps in the core are the lifecycle in [Money & Data Flow](01-money-and-data-flow.md). The arrows out to the right are the adapters in [Government Connections](02-government-connections.md). The arrow down to the Treasury is settlement.

## Five principles that make it trustworthy

These five ideas come up again and again. They're *why* the rail is credible, not just convenient:

1. **It never holds the money.** Records and routes; the cash flows citizen → provider → Treasury. No public funds sit in a middleman.
2. **One identity, anchored to the national ID.** Every citizen record is tied to their **NIN** (National Identification Number) from **NIRA**. You can't invent a taxpayer. (See [The Citizen](03-the-citizen.md).)
3. **The server sets the price.** The fee comes from the government's own schedule, fetched on the server — a clerk or app can choose *which* service and *how many*, but **never the unit price**. You can't underpay. (See [Money & Data Flow](01-money-and-data-flow.md).)
4. **Every payment leaves an immutable proof.** The confirmation from the payment provider is stored verbatim and can never be edited or deleted — audit-grade evidence.
5. **Oversight that can't tamper.** The Auditor-General can *see* everything but *change* nothing. The watcher cannot cook the books. (See [The Auditor-General](09-the-auditor-general-oversight.md).)

## How it advances government digital transformation

If someone asks *"how does this help the digital-transformation drive?"*, here's the story in six moves:

1. **From paper and cash to a single digital rail.** One pipe replaces dozens of disconnected systems and cashboxes — the textbook definition of digitising a public service.
2. **From soft identity to one verified national identity.** Anchoring every payment to the NIRA national ID kills ghost taxpayers and duplicate charging, and lets agencies finally see the *same* citizen across silos.
3. **From leakage to straight-through settlement.** Money goes directly to government collection accounts and rolls up to the **Treasury Single Account (TSA)** — closing the gap where revenue used to disappear between the desk and the bank.
4. **From blind to real-time visibility.** Agencies and the Auditor-General get live numbers — revenue by agency, by sector, by district — instead of waiting months for a reconciliation.
5. **From closed to open.** A public API lets private innovators (fintechs, super-apps, agency systems) build on government rails — the same unlock that mobile money and open banking gave the private sector.
6. **From informal to formal.** Even a cash payment at a market gets a proper fiscal receipt (via URA's EFRIS), pulling everyday transactions into the formal, taxable, recorded economy.

It also fits squarely into Uganda's existing e-government direction — it's designed to ride on **NITA-U's UGHub** (the government's interoperability bus) to reach NIRA, URA, URSB and others through the official, sanctioned channels rather than ad-hoc point-to-point links.

## Reality check — what's live today

- The **rail itself** — assessments, pricing, payments, receipts, shifts, settlement, oversight, the three front doors — is **fully built and runs end-to-end**.
- **Cash** collection is genuinely live. **Mobile money (MTN MoMo), Pesapal (cards/bank), and SMS** have real integration code and go live the moment credentials are loaded.
- Connections to **NIRA, URA/EFRIS, URSB, Lands, and the UGHub bus** currently run on **realistic placeholders** — the plumbing is built, but the live switch waits on formal agreements (MoUs) with each institution. The system is honest about this everywhere (see [Government Connections](02-government-connections.md)).

The takeaway: **the hard part — the rail, the rules, the trust model — exists and works.** What remains is signing the agreements and flipping on the live credentials, one agency at a time.

---

*Next: [How Money & Data Flow](01-money-and-data-flow.md) — the spine of the whole system.*
