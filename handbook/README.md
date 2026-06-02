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
# Sente Rails — The Handbook

This is the "how it all actually works" guide to Sente Rails — written in plain language, not technical reference. If someone asks you *"so what is Sente Rails, and how does it work?"*, everything you need to answer them well is in here.

It is organised as a set of short, self-contained documents — one per **idea** or **stakeholder**. Read them in order the first time; after that, jump to whichever one you need.

## Read in this order

| # | Document | Answers the question |
|---|----------|----------------------|
| 00 | [The Big Picture](00-the-big-picture.md) | What *is* Sente Rails? Who does it serve? Why does it matter? |
| 01 | [How Money & Data Flow](01-money-and-data-flow.md) | What happens from "a citizen owes a fee" to "money in the Treasury"? |
| 02 | [Connecting to Government Systems](02-government-connections.md) | How does it plug into NIRA, URA/EFRIS, URSB, mobile money? |
| 03 | [The Citizen](03-the-citizen.md) | What does the person paying actually experience? |
| 04 | [The Counter Clerk](04-the-counter-clerk.md) | How does a government counter work, step by step? |
| 05 | [The Supervisor](05-the-supervisor.md) | Who watches the counters, and how? |
| 06 | [The Integrator / Developer](06-the-integrator-developer.md) | How does an outside app build on the rail? |
| 07 | [The MDA / Government Agency](07-the-mda-agency.md) | What does an agency (Gulu City Council, URA…) get out of it? |
| 08 | [The Platform Admin](08-the-platform-admin.md) | Who runs the rail itself, and with what controls? |
| 09 | [The Auditor-General (Oversight)](09-the-auditor-general-oversight.md) | How does the rail stay honest and fight corruption? |
| 10 | [Who Can Do What](10-who-can-do-what.md) | The privilege map — every actor and exactly what they're allowed to do. |
| — | [Glossary](glossary.md) | NIN, EFRIS, PRN, TSA, MDA, OAG… every term in one place. |

## The recurring cast (so the examples connect)

The same handful of people and organisations appear across every document, so the journeys link up:

- **Akello** — a market vendor in Gulu. Our **citizen**: she owes daily market dues.
- **Aciro** — a **counter clerk** at Gulu City Council.
- **Okello** — Aciro's **supervisor**.
- **PayWay** — a fintech startup. Our **integrator**: they want to let people pay government fees from their app.
- **Gulu City Council**, **URA** (tax), **URSB** (business registry), **NIRA** (national ID) — the **government agencies (MDAs)**.
- **The platform team** — the **admins** who run the rail.
- **The OAG** — the **Office of the Auditor-General**, the independent watchdog.

## A note on "what's real today"

Sente Rails is built and runs end-to-end, but some connections to outside systems are **live**, some are **wired but waiting for credentials**, and some are **deliberate placeholders** waiting on formal agreements (MoUs) with the agencies that own them. Each document is honest about which is which — look for the **"Reality check"** callouts.
