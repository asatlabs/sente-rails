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
# 10 — Who Can Do What

This is the privilege map — *who* the rail recognises, *how* each one proves who they are, and *exactly* what each is allowed to do. If the question is "who has the privilege to do what?", this is the answer.

## The three front doors, three kinds of key

Everyone reaches the same rail, but the *kind of credential* differs by door:

```
   DOOR                     WHO                 CREDENTIAL                  GATED ON
   ────                     ───                 ──────────                  ────────
   Counter Stations (/work) clerks, supervisors staff login (session)      ROLE  (+ assigned agency)
   Developer Hub    (/v1)   integrator software  API key (Bearer token)     SCOPE
   Operations Console(/ops) admins, OAG          staff login (session)      ROLE
   Self-service     (/v1/me) an integrator's own  session OR own API key     (just "is it you?")
```

The deep difference:
- **People** (clerks, supervisors, admins, auditors) sign in like staff and are gated on their **role** — *what kind of user are you?*
- **Software** (integrators) carries an **API key** gated on **scopes** — *what is this specific key permitted to do?*

## The actors

| Actor | Who | Authenticates with | Uses |
|-------|-----|--------------------|------|
| **Citizen** | The person paying | *(never logs in — looked up by national ID)* | — |
| **Clerk** | A counter cashier | Staff login + role **Clerk** + assigned agency | Counter Stations |
| **Supervisor** | The clerk's manager | Staff login + role **Supervisor** | Counter Stations |
| **Integrator** | Outside software | **API key** (Bearer) with scopes | Public API |
| **Admin** | The platform operator | Staff login + role **Admin** | Operations Console |
| **OAG** | The independent auditor | Staff login + role **OAG** *(read-only)* | Operations Console (oversight only) |
| **MDA** | A government agency | *(not a login — a configured entity)* | — |

## Scopes — what an integrator's key can do

A key carries a set of **scopes**. The common ones:

| Scope | Grants |
|-------|--------|
| `catalogue.read` | Browse agencies, services, fees, notices |
| `citizens.read` | Look up a citizen by national ID |
| `citizens.write` | **Register citizens / record consent** — *privileged* |
| `assessments.read` | Read bills, shifts, dashboards |
| `assessments.write` | Create bills, open/close shifts |
| `assessments.cancel` | Cancel a bill — *privileged* |
| `payments.read` | Read payment status / traces / receipts |
| `payments.initiate` | Start a payment |
| `oversight.read` | Read cross-agency oversight data — *privileged* |
| `webhooks.manage` | Manage your own webhook endpoints |

A self-signup **sandbox** key gets the everyday set automatically (browse catalogue, read citizens, write assessments, initiate/read payments, manage webhooks). The **privileged** scopes — `citizens.write`, `assessments.cancel`, `oversight.read` — are on **no sandbox key**; they require reaching Production with a signed MoU and KYC, and an admin granting them explicitly.

## Roles — what a logged-in person can do

| Role | Door | Can read | Can change |
|------|------|----------|-----------|
| **Admin** (and platform superuser) | Operations Console | Everything | Agencies, services, integrators, keys; suspend/revoke |
| **OAG** | Operations Console (oversight) | Oversight + audit | **Nothing** (read-only) |
| **Clerk** | Counter Stations | Catalogue, own shifts, citizens | Open/close own shift, register citizen, build bill, take payment |
| **Supervisor** | Counter Stations | Clerk views + dashboard | Everything a clerk can + approve/reject/escalate variances |

The crucial split: **OAG can *see* the oversight and audit data but can *change* nothing**, while **Admin can change configuration and lifecycle but can't touch the immutable money trail.** No single role can both watch and rewrite.

## The who-can-do-what matrix

✅ allowed · 🔒 only with a privileged/live grant · — not applicable

| Capability | Integrator (sandbox) | Integrator (live) | Clerk | Supervisor | Admin | OAG |
|------------|:---:|:---:|:---:|:---:|:---:|:---:|
| Browse catalogue (agencies, fees) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Look up a citizen by ID | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Register a citizen / record consent | — | 🔒 | ✅ | ✅ | ✅ | — |
| Read bills | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Create bills | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Cancel a bill | — | 🔒 | — | — | ✅ | — |
| Open / close a shift | ✅ | ✅ | ✅ (own) | ✅ | ✅ | — |
| Take / start payments | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Read payment status / receipts | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Approve / reject / escalate a variance | — | — | — | ✅ | ✅ | — |
| Manage own keys / webhooks / logs | ✅ | ✅ | — | — | ✅ (any) | — |
| Suspend / reactivate an integrator | — | — | — | — | ✅ | — |
| Force-revoke any key | — | — | — | — | ✅ | — |
| Edit agencies / services / fees | — | — | — | — | ✅ | — |
| View oversight (revenue, anomalies, consent) | — | 🔒 | — | — | ✅ | ✅ |
| View the full audit log | — *(own logs only)* | — *(own logs only)* | — | — | ✅ | ✅ |
| Edit / delete the money trail | **never — no one can** | | | | | |

## The principle underneath

Three sentences capture the whole privilege philosophy:

1. **Capability requires a relationship.** The dangerous powers (registering citizens, oversight, cancelling bills) need a real institutional MoU + KYC, not a signup form.
2. **Watching and changing are separated.** The auditor sees but can't alter; the admin alters config but can't touch the proof.
3. **The money trail is beyond everyone.** Payment Events and the audit history can't be edited or deleted by *any* role — not even an admin. That immovable core is what makes every other privilege safe to grant.

---

*Back to the [README](README.md), or see the [Glossary](glossary.md).*
