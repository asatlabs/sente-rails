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
# 09 — The Auditor-General (Oversight)

**Meet the OAG** — the **Office of the Auditor-General**, Uganda's independent watchdog over public money. They don't collect revenue, run agencies, or build apps. Their job is to *watch* — to make sure the money is real, the citizens consented, and nothing crooked is happening.

This document is, in a sense, the whole point of the trust model. A revenue rail is only as credible as its independent oversight. So how does the rail let the auditor see everything — while guaranteeing they can change nothing?

## The one rule that defines oversight

> **The OAG can see everything and change nothing.** Every oversight view is read-only by construction — there is no write, edit, or delete path anywhere in the oversight surface. The watcher cannot cook the books being watched.

This isn't a promise or a setting that could be flipped — it's structural. The auditor's role grants *read* access to the oversight and audit views and **nothing else**: they can't edit an agency, touch a key, resolve a flag, or alter a single payment record.

## How the auditor connects (the schematic)

```
   OAG signs in  ──►  staff session  +  role: "Sente Rails OAG"   (READ-ONLY)
        │
        ▼
   ┌──────────────── OVERSIGHT VIEWS  (/ops, read-only) ────────────────┐
   │                                                                    │
   │  REVENUE AGGREGATES   total collected, by MDA / sector / district  │
   │  STATISTICS           revenue by sector, txns by district,         │
   │                       taxpayer counts (UBOS-style)                 │
   │  ANOMALY FEED         the fraud tripwires that fired               │
   │  CONSENT AUDIT        proof citizens consented (by purpose)        │
   │  PAYMENT-EVENT STREAM the immutable money trail                    │
   │  AUDIT TRAIL          full change-history of any record            │
   └────────────────────────────────────────────────────────────────────┘

        reads from ──►  Payment Events (immutable) · Consent ledger (append-only)
                        Anomaly Flags · full version history
```

*(The same oversight data is also available to trusted software via a special, privileged API scope — but that scope is never on an ordinary developer key.)*

## What the auditor can see

### Revenue, sliced every way
Total collected, transaction counts, averages, distinct taxpayers — over any window, grouped **by agency, by economic sector, or by district**, with the top services in each. The auditor can answer "how much did Gulu collect in market dues last month?" or "which district's revenue jumped?" directly from the live data.

### Official statistics
Bureau-of-statistics-style metrics — revenue by sector, transactions by district, the count of distinct paying citizens — feeding national reporting from primary data rather than after-the-fact estimates.

### The consent audit
Proof that data-sharing across agencies is actually backed by **live, unexpired, evidenced consent** — counts of active consents by agency and purpose, and the raw consent events (who, which agency, what purpose, granted when, by what evidence). A data-protection regulator can verify compliance from the ledger itself.

### The immutable money trail
A stream of every confirmed payment — amount, provider, transaction ID, agency, channel, linked to its assessment and citizen. This is the verbatim, never-edited record (see [Money & Data Flow](01-money-and-data-flow.md)).

### The full change history
For any record, the complete version history — every save the system ever made. Nothing about a bill or payment can be quietly changed without it showing here.

## The fraud tripwires — anomaly detection

The rail watches itself automatically and raises **Anomaly Flags** that land in the auditor's feed. Each flag records *what* fired, *by how much* it crossed the threshold, and *which record* it points at — turning "looks suspicious" into a numeric, defensible finding. The categories map to real abuse:

```
   FLAG TYPE                 CATCHES…
   ─────────                 ────────
   Cash Variance          ►  a clerk's drawer doesn't match what was collected (skimming)
   Duplicate Assessment   ►  the same liability billed twice (double-charging / laundering)
   Unusual Amount         ►  an outlier payment, far off the norm for that service
   Timing Anomaly         ►  activity at odd hours / backdated or clustered entries
   Permission Misuse      ►  someone acting beyond their role
   Velocity Spike         ►  an abnormal burst of transactions (automated abuse / rushed cash-out)
   Cross-MDA Inconsistency►  contradictory data for one entity across agencies
```

The cash-variance flag is the one we've already met: any counter that closes more than 50,000 off auto-raises it — independent of the supervisor (see [The Supervisor](05-the-supervisor.md)). So even if a clerk and supervisor colluded, the big discrepancies have already left a flag the auditor sees.

## How this fights corruption

Put the three trust layers together and you get an anti-corruption architecture, not just a feature list:

- **Identity that can't be faked.** Every payment traces to one real, NIRA-anchored citizen — no ghost taxpayers, no duplicate attribution. (See [The Citizen](03-the-citizen.md).)
- **A record that can't be erased.** Payment Events and consent events are immutable/append-only; the full version history catches any change. Money and consent leave permanent footprints.
- **A watcher that can't tamper.** The auditor sees revenue, consent, anomalies, and full history across every agency — with zero ability to alter any of it.

In one line: **the rail makes it hard to invent a payer, impossible to quietly delete the proof, and easy for an independent auditor to spot a clerk skimming or a transaction burst that shouldn't exist.**

## Reality check

The oversight surface is **built and verified** — aggregates, statistics, the anomaly feed, the consent audit, the payment-event stream, and the audit trail all work, gated to read-only for the OAG role. The anomaly *detectors* exist as categories with the cash-variance one firing automatically today; the richer statistical detectors (velocity, unusual-amount, timing) are the natural place to deepen as real transaction volume grows.

---

*Next: [Who Can Do What](10-who-can-do-what.md) — the complete privilege map.*
