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
# 04 — The Counter Clerk

**Meet Aciro.** She works a payment desk at Gulu City Council. She's our clerk — the human front line of the rail, serving citizens like Akello one at a time and balancing her cash drawer at the end of the day.

The clerk uses the **Counter Stations** front door (internally, the `/work` surface). It's a browser screen, designed so that someone who isn't technical can run a busy desk all day.

## How the clerk connects (the schematic)

```
   Aciro signs in at /login  ──►  staff session (cookie)  +  role: "Clerk"
        │                                                   +  assigned agency: GULU
        ▼
   ┌──────────────── COUNTER STATION  (/work) ────────────────┐
   │                                                          │
   │  whoami ───────► "you're a clerk at GULU"                │
   │  open shift ───► Counter Shift (opening float)           │
   │  look up citizen ─► NIRA lookup ──► Citizen record       │
   │  build bill ─────► Assessment (server-priced)            │
   │  take payment ───► Payment Intent ─► Payment Event       │──► money → GULU account
   │  close shift ────► count drawer ─► variance              │──► Supervisor / anomaly check
   └──────────────────────────────────────────────────────────┘
```

Two things define Aciro's access:
- **Her role** — "Sente Rails Clerk" — says *what* she can do.
- **Her assigned agency** — GULU — says *where* she can do it. A clerk can only transact at her own assigned agency. A clerk with no assignment can sign in but cannot take a single payment. (See [Who Can Do What](10-who-can-do-what.md).)

She never holds an API key. She signs in like any staff member; the rail knows it's *her* and logs every action under her name.

## The clerk's day, step by step

### 1. Sign in and land
Aciro logs in. The station greets her, confirms she has counter access, and auto-selects her agency (GULU). She sees only Gulu's services.

### 2. Open a shift (the cash drawer)
Before taking any money, she **opens a shift** — declaring her **opening float** (the cash already in the drawer, say 100,000). This creates a **Counter Shift**: her till session for the day. She can only have one open shift at a time at one counter.

### 3. Look up (or register) the citizen
Akello gives her ID. Aciro searches by NIN. If Akello already exists, up she comes. If she only exists at NIRA, Aciro registers her — which find-or-creates the local record and logs the consent (Akello is standing right there — that's the consent gesture). (See [The Citizen](03-the-citizen.md).)

### 4. Build the bill (Assessment)
Aciro picks the service — *Daily Market Dues* — and quantity. The rail creates an **Assessment**, **fetching the official price itself** (Aciro can't type a different number). She confirms it; the bill is now **Assessed** with a locked total.

### 5. Take the payment
Akello chooses how to pay. Each payment is a **Payment Intent** carrying **one channel**:

- **Cash** — Aciro takes the notes; the rail records a cash payment.
- **MTN MoMo / Airtel Money** — the rail pushes a prompt to Akello's phone; she enters her PIN.
- **Card / bank** — via Pesapal.

The rail confirms the payment (a webhook from the provider, or the clerk's screen polling), writes the immutable **Payment Event**, and marks the bill **Paid**.

> **Split payments are modelled as two intents on one bill.** If Akello pays 20,000 cash and 10,000 by MoMo on a 30,000 bill, that's *two* payment intents on the same assessment — one Cash, one MoMo. Each lands in its own bucket on the shift totals. (This keeps every payment to a single, clean channel — important for the end-of-day maths.)

### 6. The receipt
There's no separate "print receipt" step in the data — the receipt *is* the confirmed payment, with its verifiable QR. (Physically printing it on a thermal printer is exactly the kind of workstation polish we'll add in the fine-tuning phase.)

### 7. Close the shift and balance the drawer
At end of day, Aciro **closes her shift** and enters the **counted cash** — what's physically in the drawer. The rail does the reconciliation:

```
   cash_expected   =  opening_float  +  cash_collected
   cash_variance   =  cash_counted   −  cash_expected     ( + = over,  − = short )
```

- If there's **any** variance, Aciro **must type a reason** to close — no silent discrepancies.
- If the variance is **large** (over 50,000), the rail automatically raises an **Anomaly Flag** for the auditor — the classic skimming tripwire.

The shift now sits on her supervisor's dashboard for sign-off.

## What the clerk can — and can't — do

- **Can:** open/close *her own* shift, look up & register citizens at her agency, build bills, take payments across all channels, see her own shifts.
- **Can't:** transact at another agency, approve her own cash variance, reopen a closed shift, or give discounts/refunds (these don't exist on the clerk surface today — see below).

## Reality check — what's built vs. to-be-tuned

- **Fully working:** the whole serve-a-citizen loop — sign in, open shift, look up/register citizen, build bill, take payment across channels, confirm, and the reconciliation maths (expected vs counted → variance, mandatory reason, big-variance auto-flag).
- **For the workstation fine-tuning phase:**
  - **Receipt printing** (thermal printer) and **barcode/QR scanning** — the physical-desk polish you flagged.
  - A small **bug in the counter close-shift path** (it writes to the wrong field names and skips the variance reason) — the clean close path exists; the counter wrapper needs aligning to it.
  - **Discounts, refunds, returns, voids** — not built on the clerk surface yet (the only correction today is an admin cancelling a bill on the main rail). Worth designing intentionally.

These are exactly the "finetune the workstations" items — captured here so they're not forgotten.

---

*Next: [The Supervisor](05-the-supervisor.md) — who watches the counters.*
