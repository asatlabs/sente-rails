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
# 06 — The Integrator / Developer

**Meet PayWay.** A small Kampala fintech with a popular payments app. They want to let their users pay government fees — market dues, licences, land searches — without leaving the app. They're our integrator: an outside software team building *on* the rail.

Integrators are how Sente Rails becomes a platform, not just a counter system. The same way mobile money and open banking let private developers build on financial rails, Sente Rails lets developers build on **government revenue** rails — through the **Developer Hub** and public API (internally, the `/v1` surface).

## How an integrator connects (the schematic)

```
   PayWay (software)
        │  carries an API key:  Authorization: Bearer sk_...
        ▼
   ┌──────────────── PUBLIC API  (/v1) ─────────────────┐
   │   key is checked:                                  │
   │     • valid & not expired?                         │
   │     • owning account Active (not suspended)?       │
   │     • does the key hold the required SCOPE?         │
   │                                                    │
   │   catalogue.read   ─► browse agencies & fees       │
   │   citizens.read    ─► look up a citizen by ID      │
   │   assessments.write─► create a bill                │
   │   payments.initiate─► start a payment              │
   │   payments.read    ─► check status / receipt       │
   └────────────────────────────────────────────────────┘

   Self-service (manage your own account):  /v1/me
     ├─ profile        ├─ create / rotate / revoke keys
     └─ webhooks       └─ your own audit logs
```

Unlike a clerk (who logs in as a person), PayWay's *software* authenticates with an **API key** — a secret token on every request. The key carries **scopes**: fine-grained permissions saying exactly what that key is allowed to do.

## Getting started — the self-serve sandbox

PayWay doesn't need a meeting to begin. They self-serve:

1. **Sign up** at the Developer Hub with a name, email, and acceptance of the sandbox terms.
2. **Verify the email** with a 6-digit code. The account flips to **Active**.
3. **Receive a sandbox key** — shown exactly once (store it now; it can't be recovered).

That sandbox key comes pre-loaded with a sensible default set of scopes — enough to build and test the full flow against safe placeholder data: browse the catalogue, look up citizens, create bills, start payments, read status, and manage their own webhooks.

## The lifecycle — from "just testing" to "live"

An integrator account moves along a ladder. Three independent things are tracked:

- **Status** (account health): `PendingEmail → Active → Suspended`. A key only works while the account is **Active**; suspension instantly kills every key.
- **Tier** (capability/maturity): `Registered → Onboarding → Production`. Self-signup lands you at *Registered* (sandbox). Moving to *Production* — after a formal agreement (**MoU**) and identity checks (**KYC**) — is what unlocks a **live** key.
- **Pricing tier** (commercial plan): `Free → Developer → Business → Enterprise → MDA`.

> **The privileged scopes are gated behind going live.** Some powers are *never* on a sandbox key — for example **registering citizens**, **cancelling assessments**, or **reading oversight data**. To get those, PayWay must reach Production with a signed MoU and KYC, and an admin issues a live key with those scopes explicitly granted. So the dangerous powers require a real institutional relationship, not just a signup form.

## What PayWay actually builds

A typical integration mirrors the rail's spine (see [Money & Data Flow](01-money-and-data-flow.md)):

1. **Browse** the catalogue of agencies and services (`catalogue.read`) — so the app can show "Gulu — Market Dues — 5,000/day."
2. **Identify** the citizen by their national ID (`citizens.read`).
3. **Create** a bill (`assessments.write`) — the server prices it, so PayWay literally cannot let a user underpay.
4. **Start** the payment (`payments.initiate`) — and the user pays from within PayWay's app.
5. **Confirm** via webhook or polling (`payments.read`), and show the verifiable receipt.

PayWay never sets prices, never touches government accounts, and never holds the funds — they orchestrate; the rail enforces.

## Managing their own account (self-service)

Through the Developer Hub, PayWay manages *their own* corner safely (a separate, simpler door — internally `/v1/me`):

- See their **profile** and live counters (how many keys, how many requests this week).
- **Create, rotate, and revoke** their own keys. Rotation is graceful: the old key keeps working for a grace window while they update their apps, then expires.
- Register **webhook** endpoints to receive payment confirmations.
- Read **their own audit logs** (90-day window) — every call they made, with a request ID they can quote in support.

A nice security detail: if PayWay asks about a key that belongs to a *different* integrator, the rail says "not found" — never "that's not yours." It refuses to even confirm another integrator's keys exist.

## Why this matters

For PayWay, Sente Rails turns "paying a government fee" into a few API calls — no bilateral integration with each agency, no handling of government money, no price logic to get wrong. For the government, every such app widens the on-ramp for revenue while the rail keeps the rules (pricing, identity, proof, settlement) centrally enforced. **The government opens a door; the rail makes sure no one can misuse it.**

## Reality check

The entire integrator surface is **built and battle-tested** — signup, email verification, key issuance, scopes, rotation/revocation, self-service profile, webhooks, and audit logs all work end-to-end. This was the most mature, cleanest part of the whole system. What grows over time is the *catalogue* behind it (more agencies, more services) and the institutional MoU/KYC pipeline that moves serious integrators to Production.

---

*Next: [The MDA / Government Agency](07-the-mda-agency.md) — the agency's own perspective.*
