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
# 03 — The Citizen

**Meet Akello.** She sells vegetables in Cereleno Market, Gulu. Every day she owes market dues. She's our citizen — the person the whole rail ultimately exists to serve, and to protect.

The citizen never logs in to Sente Rails. They're not a user with a password — they're a *person being served*. But how the rail handles them is one of its most important design choices.

## How the citizen connects (the schematic)

```
   Akello (citizen)  ──── identified by her national ID number (NIN) ────┐
        │  (never logs in)                                               │
        ▼                                                                ▼
   ┌─ check local registry ─┐   miss   ┌─ ask NIRA ─┐   found   ┌──────────────────────┐
   │  already on the rail?  │ ───────► │  national  │ ────────► │  Citizen record       │
   └────────────┬───────────┘          │  ID lookup │           │  • one per NIN        │
                │ hit                   └─────┬──────┘ not found  │  • verified only if   │
                ▼                             ▼     (clean 404)   │    NIRA vouches       │
          use it, unchanged           don't invent a person      └──────────┬───────────┘
                                                                            │
                                            ┌───────────────────────────────┼───────────────┐
                                            ▼                               ▼               ▼
                                   Consent Event              Bill (server-priced)    Receipt + QR
                                   (purpose · evidence ·                              └► public verifier
                                    who · when; append-only)                            (anyone checks;
                                                                                         no PII shown)
```

## How a citizen is identified — anchored to the national ID

Akello isn't "created" by a clerk typing a name. She's **looked up by her national ID number (NIN)** — the 14-character number NIRA issues to every Ugandan.

This anchoring is deliberate and load-bearing:

- **One human, one NIN, one record.** The system physically refuses two citizen records with the same NIN. No duplicates, no ghosts.
- **You can't invent a taxpayer.** A clerk can't fabricate a person — the identity has to resolve to a real NIRA record. This closes the exact gap corruption exploits (attributing revenue to people who don't exist, or charging the same person twice under two records).
- **The same person across every agency.** Because Gulu, URA and URSB all key to the same NIN, they finally see the *same* Akello — not three different soft records.

### The find-or-create cascade

When Aciro looks Akello up by NIN, the rail does this, in order:

1. **Check the local registry first.** If Akello already has a record, use it — unchanged. (No duplicate, no second consent capture.)
2. **If not, ask NIRA.** The identity adapter looks her up at the national registry. If found, her authoritative details (name, date of birth, district) are copied in, and a *new* local record is created — anchored to her NIN.
3. **If neither has her** — a clean "not found", never a silently-invented person.

A subtle but important honesty detail: a citizen is marked **verified** *only* when the national registry actually vouches for them. While the NIRA connection is still on placeholder data, lookups stay marked unverified — the rail never claims a verification the state didn't actually give.

## What data is held — and what isn't

The rail keeps the **minimum** it needs: the NIN and (optionally) tax number; name and date of birth; contact details; district/address; and consent records. That's it — no more than is needed to bill and serve.

And it's careful about what *leaves* the system. When citizen data is returned over the API, it's run through a strict allowlist that **drops internal fields** — including *who* on staff touched the record. The public can never see the machinery underneath, and an outside app can't forge a "verified" citizen or backdate a consent.

## Consent — the citizen's data is protected by a paper trail

Uganda's **Personal Data and Privacy Act (2019)** says: if you use someone's personal data, you need their consent, it must be **for a stated purpose**, and you must be able to **prove** it.

Sente Rails implements this as an **append-only consent ledger**. Every time a citizen's data is touched in a way that needs consent, a permanent **Consent Event** is recorded — and these records can never be deleted.

Each consent record captures:

- **Whose** data and **which agency** is touching it.
- **The purpose** — a specific reason: *Service Consumption, Identity Verification, Cross-MDA Sharing, Marketing, or Statistical Aggregation.* (Specificity is the law's requirement, turned into a rule.)
- **Whether it was granted**, and when.
- **How it was proven** — *in-person, OTP, a written letter, or an API consent* — plus the evidence itself.
- **Who captured it** — stamped automatically; you can't claim someone else did.
- **Lifecycle** — when it expires, if/when it was revoked.

The design has a humane touch: when Akello stands at the counter and Aciro pulls up her record, **her physical presence is the consent gesture** (logged as in-person evidence). And if a consent record ever fails to write, it's logged but **never blocks** the service Akello came for — data protection must not become a denial of service.

At *use* time — say, when one agency wants to share Akello's data with another — the rail checks whether there's an **active** consent for exactly that (citizen, agency, purpose): granted, not revoked, not expired. So consent isn't just recorded; it's enforced.

## What Akello actually experiences

From Akello's point of view, the technology is invisible. Her experience is simply:

1. She walks up to the Gulu counter (or, in future, opens an app built on the rail).
2. She gives her ID; the clerk finds her.
3. She's told what she owes — the correct, official amount.
4. She pays — mobile money, cash, or card.
5. **She gets a receipt with a QR code.** Anyone — a market inspector, a bank, herself next month — can scan it and confirm the payment is genuinely on file. If she loses it, the record still exists; if someone forges one, the scan won't verify.

That verifiable receipt is a quiet revolution: a market vendor's 5,000-shilling payment is now as checkable as a bank transfer.

## Why this matters

For the citizen, Sente Rails means: **you're charged the right amount, your payment is provable, your identity isn't duplicated or faked, and your personal data leaves a protected, consented trail.** For the country, it means revenue can always be traced to a real, single person — the foundation everything else is built on.

---

*Next: [The Counter Clerk](04-the-counter-clerk.md) — the person on the other side of the desk.*
