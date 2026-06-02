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
# 05 — The Supervisor

**Meet Okello.** He manages the payment desks at Gulu City Council. Aciro and several other clerks report to him. He's our supervisor — the human control point that turns "a clerk counted her drawer" into "the cash is accounted for."

The supervisor uses the same **Counter Stations** door as the clerk, but with extra powers a clerk doesn't have.

## How the supervisor connects (the schematic)

```
   Okello signs in  ──►  staff session  +  role: "Supervisor"
        │
        ▼
   ┌─────────────── SUPERVISOR VIEW  (/work) ───────────────┐
   │                                                        │
   │  Dashboard (one agency, one day)                       │
   │    ├─ tiles: total collected, open shifts,             │
   │    │         shifts in variance, closed shifts         │
   │    ├─ per-counter rows: clerk, collected, counted,     │
   │    │         expected, VARIANCE, reason, last action   │
   │    ├─ by service   (what was sold)                     │
   │    └─ by channel   (cash / MoMo / Airtel / card …)     │
   │                                                        │
   │  On a shift with a variance:                           │
   │    APPROVE  ──► sign off, chain of custody closed      │
   │    REJECT   ──► reopen the shift, clerk recounts       │
   │    ESCALATE ──► raise to the Treasurer                 │
   └────────────────────────────────────────────────────────┘
                         ▲
        auto Anomaly Flag │ (any variance over 50,000 — independent of Okello)
```

## What the supervisor sees — the dashboard

Okello opens his dashboard for Gulu and picks a day. He gets:

- **Summary tiles:** total collected, how many shifts are open, how many are closing right now, how many have a cash variance, how many are closed.
- **A row per counter:** which clerk, their counter label, status, when they opened/closed, how long, how many transactions, total collected, **cash counted vs expected**, the **variance**, the clerk's stated **reason**, and the **last action** taken on it (approved / rejected / escalated).
- **By service:** what was actually sold that day.
- **By channel:** how the money came in — cash, MoMo, Airtel, card, bank, voucher — with each channel's share.

An empty day shows zeros, never an error — so Okello can trust the dashboard even first thing in the morning.

## The control he holds — the approve / reject / escalate ladder

When a shift closes with a cash variance, Okello is the gate. He has three moves, and each one stamps a permanent, timestamped note into the shift's record (so there's always a trail of who decided what):

- **APPROVE** — *"I accept this variance and the clerk's reason."* The chain of custody is closed. (E.g. Aciro was 1,000 short because she gave wrong change; Okello signs it off.)
- **REJECT** — *"This isn't right — recount."* This **reopens the shift** and bounces it back to the clerk. (This is the *only* sanctioned way a closed shift reopens.) A reason is required.
- **ESCALATE** — *"This is above me."* Raises the variance to the **Treasurer** for a higher-level decision. A reason is required.

A clean separation of duties: **the clerk handles the money; the supervisor signs off on the discrepancy.** A clerk can never approve her own variance.

## The automatic tripwire — Anomaly Flags

Okello's judgement is backed by an automatic, independent check. **Any** shift that closes more than 50,000 off raises an **Anomaly Flag** on its own — whether or not Okello does anything. That flag goes to the auditor's queue (see [The Auditor-General](09-the-auditor-general-oversight.md)).

So there are two layers:
- **Soft:** the dashboard flags *every* non-trivial variance for Okello's eyes.
- **Hard:** big variances auto-escalate to independent audit, beyond Okello's control.

This is the anti-collusion design — even if a supervisor were inclined to wave through a suspicious drawer, the big ones have already left a flag the auditor sees.

## Worked example — a small variance and a big one

**The small one (approved):** Aciro opens with 100,000, collects 20,000 cash through the day, so the drawer should hold 120,000. She counts 119,000 — **1,000 short** — and closes with the reason *"gave 1,000 short change, customer left."* Because it's under 50,000, no anomaly flag. It shows on Okello's dashboard flagged for review; he reads the reason, accepts it, and **approves**. The chip flips to "approved." Done.

**The big one (flagged + acted on):** A different clerk closes **80,000 short**. The system **auto-raises a Cash-Variance Anomaly Flag** the moment the shift closes. On his dashboard Okello can **reject** it ("recount the drawer" — reopens the shift) or **escalate** it to the Treasurer. Either way, the auditor already has the flag — independent of what Okello decides.

## Reality check

- **Fully working:** the dashboard (tiles, per-counter rows, by-service, by-channel), the approve/reject/escalate actions with their permanent audit notes, the reopen-on-reject behaviour, and the automatic big-variance anomaly flag.
- **For later:** **escalate** currently records the decision but the **Treasurer's queue itself isn't built yet** — escalations are stamped but don't yet land in a dedicated treasury workflow. That treasury surface is a known next-tier piece.

---

*Next: [The Integrator / Developer](06-the-integrator-developer.md) — building apps on the rail.*
