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
# Sente Rails

[![License](https://img.shields.io/badge/license-Proprietary-red.svg)](license.txt)

**A national rail for government revenue in Uganda.** Sente Rails lets any
Ugandan pay any government fee through one consistent digital pipe, routes the
money straight to the Treasury, issues a verifiable receipt, and gives every
stakeholder — the citizen, the counter clerk, the agency, the auditor, and
outside developers — their own safe window into it. It is a system of record
for agencies that need one, and an integration-and-orchestration layer for
agencies that already have their own systems — composable, API-first, and
**by design it never holds public money**.

*("Sente" means money.)*

Proprietary · © Geoffrey Oketwangwu (ASAT LABS), Gulu, Uganda. All rights reserved.

---

## What it does, in one example

**A vegetable seller in Gulu pays her daily market dues.** A council clerk
finds her by her national ID, the system prices the fee from the agency's
own schedule (so it can't be under-charged), she taps to pay by mobile money,
and the 1,500 shillings move **directly** from her wallet to Gulu City
Council's collection account — Sente Rails never touches the cash. She gets a
receipt with a QR code that anyone can scan to verify. The payment is recorded,
provable, and on its way to the Treasury. A market payment is now as traceable
as a bank transfer.

**A fintech adds government bill-pay to its app.** It signs up for a free
sandbox key in about a minute, browses the live catalogue of agencies and
fees, and within a few API calls can resolve a citizen, build a bill spanning
several agencies at once, and start a payment — without ever handling
government money or setting a price itself. The rail keeps the rules; the
developer builds the experience.

## Why it's trustworthy

Five principles run through everything:

1. **It never holds the money.** Funds flow citizen → payment provider →
   Treasury; the rail records and routes, but is never a wallet (Public Finance
   Management Act posture).
2. **One identity, anchored to the national ID.** Every citizen is tied to
   their NIRA record — no ghost taxpayers, no duplicates.
3. **The server sets the price.** Fees come from each agency's statutory
   schedule, fetched server-side — a caller chooses *what* and *how many*, never
   the amount. You can't underpay.
4. **Every payment leaves immutable proof.** The provider's confirmation is
   stored verbatim and can never be edited or deleted — audit-grade evidence.
5. **Oversight can't tamper.** The Auditor-General can see everything across
   every agency and change nothing.

## Who it serves

| Stakeholder | What they get |
|-------------|---------------|
| **Citizens** | One way to pay, a verifiable receipt, protected personal data |
| **Counter clerks & supervisors** | A simple till to assess, collect, and reconcile |
| **Agencies (MDAs)** | A ready-made collection system and straight-to-Treasury settlement |
| **Integrators** | A public API to build government bill-pay into any app |
| **Platform admins** | Tools to onboard agencies and run the rail |
| **The Auditor-General** | Independent, read-only oversight over all revenue |

Everyone reaches the same rail through one of three front doors: **Counter
Stations** for clerks, the **Developer Hub & public API** for integrators, and
the **Operations Console** for admins and oversight.

## Documentation

- **[The Handbook](handbook/README.md)** — start here. Plain-language,
  example-driven journeys for every stakeholder (what it is, how money flows,
  how it connects to NIRA / URA / URSB, who can do what), with diagrams.
- **Developer Hub** — `/docs` on any deployed instance: quick-start, security &
  compliance, API standards, SDKs, webhooks, the agency & service catalogue,
  and a cookbook of runnable recipes.
- **API explorer** — `/docs/explorer`: the full OpenAPI 3.1 reference, with
  one-click OpenAPI and Postman exports.

The **live sandbox** runs at [`sente-rails.space`](https://sente-rails.space) —
explore the docs, browse the catalogue, and run every cookbook recipe against
`https://sente-rails.space/v1`.

## Rollout status

The rail is built and runs end-to-end. Cash collection is live; mobile money
(MTN MoMo), card/bank (Pesapal), and SMS are integration-complete and go live
on credentials. Connections to NIRA, URA/EFRIS, URSB, and the lands registry
run on realistic sandbox data today and switch to live traffic per agency as
the underlying agreements are signed — the deployment roadmap, agency by
agency.

## Installation

Sente Rails runs on a Python application framework (proprietary application layer; the
underlying framework is third-party) and ships as a deployable application that installs
alongside the framework's standard CLI tooling.

```bash
# In your existing deployment workspace:
get-app https://github.com/asatlabs/sente-rails --branch main
install-app sente_rails
migrate
```

## License

Proprietary — see [license.txt](license.txt). © 2026 Geoffrey Oketwangwu (asatlabs.org). All rights reserved.
