<!--
Copyright (c) 2026 Geoffrey Oketwangwu (asatlabs.org)
Author:  Geoffrey Oketwangwu <geoffreyoketwangwu@gmail.com>
CONFIDENTIAL AND PROPRIETARY — All rights reserved.
-->

# Counter Station — Demo Walkthrough

A ten-minute, end-to-end run of the counter: take a government payment, issue a
fiscal receipt, correct a mistake, reconcile the drawer, and show the
supervisor's oversight view. Everything below runs on **`sente-rails.space`**.

---

## Before you start

**Reset to a clean slate** (closes any open shift, restores the demo
credentials, clears old flags — safe to run before every demo):

```
bench --site sente-rails.space execute sente_rails.demo_reset.run
```

**Sign-in** — every account shares the password **`nantege2009`**. Sign in at
**`https://sente-rails.space/login`** (each role lands on its own surface), or
use the per-role deep links below.

| Role       | Email                          | Lands on          | Direct link |
|------------|--------------------------------|-------------------|-------------|
| Clerk      | `clerk@sente-rails.space`      | `/work/shift`      | `https://sente-rails.space/login?redirect-to=/work/shift` |
| Supervisor | `supervisor@sente-rails.space` | `/work/supervisor` | `https://sente-rails.space/login?redirect-to=/work/supervisor` |
| OAG (oversight) | `oag@sente-rails.space`   | `/ops`             | `https://sente-rails.space/login?redirect-to=/ops` |
| Treasurer  | `treasurer@sente-rails.space`  | `/treasury` *(surface not built yet)* | `https://sente-rails.space/login` |

**Supervisor PIN** (authorises refunds + waivers at the counter): **`2468`**

The Clerk + Supervisor are scoped to **Gulu City Authority (GULU)** — the
counter demo all happens at the Gulu counter.

**Demo data to use**

| Thing            | Value                                                       |
|------------------|-------------------------------------------------------------|
| Citizen          | Patrick Okello Akena · NIN `CM85042134GULU` · Gulu          |
| Service          | **Trading License Renewal** — UGX 50,000                    |
| MoMo sandbox no. | `46733123450` approves · `46733123452` fails · `46733123453` times out |

> Optional hardware: a printer-equipped workstation (printing service running)
> with an 80 mm thermal printer + cash drawer + scanner. Without hardware the
> same flow still works — receipts and reports render on screen, and the print
> buttons simply have nothing to talk to. Set the printer once on the Shift
> screen ("Station setup").

---

## The run

### 1 — Open the shift  *(≈30s)*
Sign in as the **clerk** and open `/work`. On the **Shift** screen the counter
MDA is already pinned to Gulu. Enter a counter label (e.g. *Counter 1*) and an
opening cash float (e.g. *100,000*), then **Open shift**.

> *Talking point:* the clerk is locked to one MDA and one physical counter —
> they can't collect for another agency or switch mid-shift.

### 2 — Find the citizen  *(≈30s)*
On **Assess + Collect**, type the NIN `CM85042134GULU` (or **scan** the ID — a
scanned NIN jumps straight to the lookup, hands-free). Patrick's record loads
from the rail.

> *Talking point:* if the citizen isn't on the rail yet but is known to the
> national register, the clerk can register them on the spot with their consent.

### 3 — Assess the fee  *(≈30s)*
Pick **Trading License Renewal**. It drops into the cart at UGX 50,000. Press
**Assess & collect** — the server recomputes the fee authoritatively (no
client-side prices).

### 4 — Take payment + fiscal receipt  *(≈1 min)*
Choose **Cash**, type what the citizen handed over (e.g. *50,000*, or tap a
quick-amount) — the **change due** shows instantly — then **Take cash payment**.
On confirmation:
- the **receipt prints and the drawer pops** in one action (with hardware);
- the **URA EFRIS Fiscal Document Number** appears on screen and on the
  receipt, with a verification QR.

> *Talking point:* every counter receipt is a **fiscal** receipt — fiscalised
> with URA at the moment of payment, not reconciled later.

To show mobile money instead: pick **MTN MoMo**, use `46733123450`, and it
auto-approves. Use `…452` to show a clean failure screen and `…453` for a
timeout — both let the clerk retry or switch method instead of getting stuck.

### 5 — Correct a mistake  *(≈1 min)*
On the confirmation screen, choose **Refund / reverse this payment**. Enter a
reason and the **supervisor PIN `2468`**. The payment reverses and the receipt
voids — recording *both* the clerk who processed it and the supervisor who
authorised it.

> *Talking point:* nothing that moves money happens without a named
> supervisor's authorisation, captured in the audit trail.

*(Or show a **waiver**: on the payment screen choose "Apply supervisor waiver",
reduce the fee with a reason + PIN — the receipt then prints Subtotal / Waiver /
Total.)*

### 6 — Mid-shift snapshot  *(≈30s)*
Back on the **Shift** screen, press **X-report** — a live snapshot of the
drawer: collections by method and service, cash expected, refunds and waivers
so far. It does not close the shift.

### 7 — Close + reconcile  *(≈1 min)*
Press **Close shift**. Count the drawer; to demonstrate the variance flow, enter
a figure a little **off** from expected (e.g. 5,000 short). Closing produces the
**Z-report** (the official end-of-shift tape) and routes the variance to the
supervisor.

### 8 — Supervisor oversight  *(≈1.5 min)*
Open a second browser (or sign out) and sign in as the **supervisor**; go to
`/work/supervisor`. The cockpit shows, for Gulu today:
- **tiles** — collected, open shifts, variances pending, refunds, waivers, flags;
- the **variance queue** — approve the shift you just closed, or reject it for a
  re-count;
- the **corrections ledger** — the refund/waiver you just made, each stamped
  with who authorised it;
- **anomaly flags** — if a close ran a large variance, it surfaces here with
  one-tap triage.

> *Talking point:* this is the accountability layer — a supervisor sees every
> exception across their counters in real time, and nothing clears without a
> name against it.

---

## What to emphasise

- **Sovereign + fiscal** — a Ugandan revenue rail that fiscalises every receipt
  with URA at the point of payment.
- **Accountability by design** — refunds, waivers and variances each require a
  named supervisor authorisation, recorded immutably.
- **Built for the real counter** — thermal receipts, cash drawer, scanner,
  tender/change, and a close-out tape, not just a web form.
- **Open at the edges, controlled at the core** — the API is OpenAPI for
  government integrators; the rail itself stays maintained and observed.

## Between runs
Re-run the reset command at the top. It closes the demo shift, restores the
credentials, and clears flags — so every walkthrough starts clean.
