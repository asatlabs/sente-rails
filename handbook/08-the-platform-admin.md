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
# 08 — The Platform Admin

**Meet the platform team** — the people who run Sente Rails itself. They're not a government agency and not a developer; they're the **operators** of the rail. When a new agency needs onboarding, a developer needs help, or something needs watching, they're who acts.

Admins use the **Operations Console** front door (internally, the `/ops` surface). They sign in with a staff login carrying the **Sente Rails Admin** role (or platform superuser).

## How the admin connects (the schematic)

```
   Admin signs in  ──►  staff session  +  role: "Sente Rails Admin"
        │
        ▼
   ┌──────────────── OPERATIONS CONSOLE  (/ops) ────────────────┐
   │                                                            │
   │  AGENCIES      view & edit MDAs, their mode & treasury acct │
   │  SERVICES      view & edit services, fees, status          │
   │  INTEGRATORS   view, SUSPEND / REACTIVATE developers       │
   │  KEYS          view all keys, FORCE-REVOKE a leaked key     │
   │  AUDIT         the full audit log, fleet-wide               │
   │  SHIFTS        every counter shift across all agencies      │
   │  ADAPTERS      which government connections are live/sandbox │
   │  SYSTEM        health snapshot (counts, build, scheduler)   │
   │  OVERSIGHT     revenue aggregates, anomalies, consent (read) │
   └────────────────────────────────────────────────────────────┘
            write powers ▲                    read-only ▲ (shared with OAG)
```

The console has two halves: **management** (things admins can change) and **oversight** (things they can only read — shared with the Auditor-General, covered in [the next doc](09-the-auditor-general-oversight.md)).

## What an admin does

### Onboarding & running agencies
- **Create and edit MDAs** — set an agency's mode (A/B/C), its treasury account, contact details, integration status.
- **Create and edit services** — define what an agency charges and the official fee, currency, and tax treatment.

This is how a new agency like Gulu comes onto the rail: an admin sets up the agency, its services and fees, and its clerks.

### Managing developers (integrators)
- **View every integrator** and drill into one — their tier, status, key counts, recent activity.
- **Suspend an integrator** — instantly cuts off *all* their keys (e.g. abuse, a compromised account). Reactivate when resolved. A reason is required and recorded.

### Managing keys
- **See every API key** across all developers.
- **Force-revoke a key** — the "a key leaked on GitHub and the developer won't act" button. Bypasses the owner; kills the key immediately. A reason is required.

### Watching the system
- **The full audit log**, fleet-wide — every API call by every actor, filterable by agency, event, status, time.
- **System health** — table sizes, the last scheduled jobs, live/sandbox adapter counts, integrator/agency/service/key counts, and which build is deployed.
- **The adapter registry** — exactly which government connections are live, sandbox, or unavailable (see [Government Connections](02-government-connections.md)).
- **Every counter shift** across all agencies — the fleet-wide version of what a supervisor sees for one agency.

## The guardrails on admin power

Admin is powerful, so the design constrains it deliberately:

- **Every action is itself audited.** When an admin suspends an integrator or revokes a key, that action writes its own audit row under the admin's name. The operators are watched too.
- **Reasons are mandatory** on consequential actions (suspend, reactivate, revoke).
- **Admins can change configuration and lifecycle — but not the money trail.** They can edit an agency's settings or suspend a developer, but they **cannot** edit or delete a Payment Event, rewrite history, or alter the immutable proof. The record of what was collected is beyond anyone's reach, admin included.
- **Management and oversight are separated.** An admin can manage; the auditor can only watch — and *neither* can tamper with the proof.

## Worked example — onboarding Gulu, and handling a leaked key

**Onboarding:** A new agency, Gulu City Council, is joining. An admin creates the MDA (mode A, status Live, treasury account set), adds its services (*Market Dues 5,000/day*, *Trading Licence 120,000/yr*) with their fee schedules, and the clerks are set up and assigned. Gulu is now collecting.

**A leaked key:** PayWay accidentally commits a live key to a public repo. Before anyone malicious uses it, an admin opens the Operations Console, finds the key, and **force-revokes it** with the reason *"exposed in public repository."* The key dies instantly; every request carrying it now fails. The action is logged under the admin's name. PayWay rotates to a fresh key and carries on.

## Reality check

The Operations Console is **fully built and working** end-to-end — agencies, services, integrators, keys, audit, shifts, adapters, system health, and the oversight views. (This was the surface that got the deepest repair pass recently; all of it is verified.) Day-to-day agency administration now happens here, on the web, rather than through back-end access — which is itself part of the digital-transformation story: even *running* the rail is a proper, audited, role-gated product surface.

---

*Next: [The Auditor-General](09-the-auditor-general-oversight.md) — independent accountability.*
