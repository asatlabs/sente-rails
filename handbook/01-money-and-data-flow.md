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
# 01 — How Money & Data Flow

This is the spine of Sente Rails. Once you understand this one journey — *from "a citizen owes a fee" to "money in the Treasury"* — everything else is a variation on it.

## The chain in one line

> **MDA → Service → Assessment → Payment Intent → Payment Event → Settlement → Treasury**

Read it as a sentence: *an **agency** offers a priced **service**; a citizen's **assessment** (bill) is rung up from one or more services; a **payment intent** is the attempt to pay it; a **payment event** is the provider's proof it was paid; **settlement** rolls those proofs up and sends the money to the **Treasury**.*

As a pipeline — the data on top, the money underneath:

```
   SERVICE        ASSESSMENT       PAYMENT INTENT      PAYMENT EVENT       SETTLEMENT
   (priced)       (the bill)       (attempt to pay)    (immutable proof)   (to Treasury)
   ───────        ──────────       ──────────────      ─────────────────   ──────────
   fee_amount ──► line rate   ──►  amount + splits ──► proof (verbatim, ──► MDA Settlement
   (govt-set)     (FETCHED,        (must sum to        never edited)        └► TSA Export
                   server-locked)   the bill total)         │                  └► IFMIS ► TSA
                                                            │
   status:  Draft ─► Assessed ─► [Sent] ─► Confirmed ─► Paid
                                    │            ▲
                          adapter fires     provider confirms
                          (MoMo/cash/…)     (webhook, or poll)

   ▼ the money itself ▼
   citizen's wallet ───────────(direct, via the provider)───────────► govt account
                          (Sente Rails never touches it)
```

Let's walk each link with Akello, our Gulu market vendor.

## The building blocks

| Thing | Plain meaning | Real example |
|-------|---------------|--------------|
| **MDA** | A government agency | *Gulu City Council* |
| **Service** | One payable thing the agency offers, with a government-set price | *"Daily Market Dues" — 5,000 UGX per day* |
| **Assessment** | A citizen's bill — one trip to the counter. Made of one or more lines. | *Akello's bill: 1 × daily market dues = 5,000 UGX* |
| **Assessment Line** | A single charge on the bill | *the market-dues line* |
| **Payment Intent** | An attempt to pay a bill, by one channel | *pay the 5,000 by MTN MoMo* |
| **Payment Event** | The provider's confirmation — the immutable proof | *"MTN confirms 5,000 received, txn #ABC"* |
| **Counter Shift** | A clerk's till session, for end-of-day cash balancing | *Aciro's Tuesday shift* |
| **Settlement / TSA Export** | The periodic roll-up that pushes money to the Treasury | *Gulu's market dues for the week* |

A key detail: **one assessment can carry lines for different agencies.** A single visit could bill a Gulu market-due *and* a URA tax in one go — and the payment will later be split to both. That's the "cross-MDA" superpower.

## The journey, step by step

### Step 1 — A bill is created (the Assessment)

Aciro the clerk picks the service ("Daily Market Dues") and rings it up for Akello. Sente Rails creates an **Assessment** with one **line**.

Here's the integrity moment: the line's price is **not typed in by anyone**. The server *pulls* the rate straight from the Service's official `fee_amount` (5,000). This is the **server-authoritative pricing** rule — see the box below. The bill total is computed by the server, not trusted from the client.

The new assessment starts as a **Draft**, is automatically linked to Aciro's open shift, and gets a unique **idempotency key** — a fingerprint that stops the same bill being charged twice if a request is retried.

### Step 2 — The bill is confirmed (Assessed)

Aciro confirms it. The assessment moves **Draft → Assessed**. The total is now locked at 5,000.

### Step 3 — A payment is attempted (the Payment Intent)

Akello chooses to pay by mobile money. Sente Rails creates a **Payment Intent**: *pay this 5,000 assessment, by MTN MoMo, from this phone number.*

The intent carries **split rules** — instructions for how to divide the money. Because Akello's bill is all Gulu, there's one split: *5,000 → Gulu's collection account.* (If the bill had also included a URA tax line, there'd be a second split routing URA's share to URA's account — automatically.) The server checks that the splits add up *exactly* to the bill total — you can't under-route.

### Step 4 — The push goes out (Sent)

Sente Rails hands the intent to the right **payment adapter** (see [Government Connections](02-government-connections.md)) — here, the MTN MoMo one. The adapter fires the "request to pay" to MTN, which makes Akello's phone buzz with a PIN prompt. The intent flips **Pending → Sent**, and the exact request/response are stored for the record.

### Step 5 — The citizen pays

Akello enters her Mobile Money PIN. **The 5,000 moves from her wallet toward Gulu's collection account — through MTN, never through Sente Rails.** This is the "never holds the money" principle in action.

### Step 6 — The provider confirms (the Payment Event)

MTN tells Sente Rails the money arrived. In production this comes as a **webhook** — MTN's server POSTs a confirmation to Sente Rails. (In demos, the clerk's screen can also *poll*: "MTN, is it done yet?")

Either way, Sente Rails now writes the most important record in the whole system: a **Payment Event**.

- It's created **only on confirmed success.**
- It stores the provider's confirmation **verbatim** (the `proof_payload`) — the raw message, signature check result and all.
- One Payment Event is written **per split** — so a multi-agency payment produces one proof per agency, each stamped with the amount, the provider's transaction ID, and the destination account.
- It is **immutable** — never edited, never deleted. This is the audit-grade evidence.

The parent assessment flips to **Paid**. Akello's screen (or receipt) updates live.

### Step 7 — Settlement to the Treasury

Akello has paid and gone — but the money's journey to the *national* Treasury continues quietly:

- Periodically, all of Gulu's confirmed Payment Events for a window are rolled into an **MDA Settlement** (one agency, one period).
- Those settlements are gathered into a **TSA Export** — a file the Treasury team submits to **IFMIS** (the national financial-management system), landing the funds in the **Treasury Single Account (TSA)**, the government's master account.

So the 5,000 has now travelled: *Akello's MoMo wallet → Gulu's collection account → the national Treasury* — every leg recorded and provable.

## The integrity controls (why you can trust the number)

Each control blocks a specific way the system could be cheated:

```
   CONTROL                        BLOCKS…
   ───────                        ───────
   Server sets the price       ►  underpaying / a fudged amount
   Splits must sum to total    ►  under-routing the money
   Idempotency key             ►  double-charging on a retry
   Immutable Payment Event     ►  editing or erasing the proof
   Log-before-verify           ►  hiding a forged / replayed message
   Guarded state machine       ►  illegal jumps (Draft→Paid; reopening a closed shift)
   Append-only consent ledger  ►  using data without a provable, purposed "yes"
   Read-only oversight         ►  the watcher altering the books
   National-ID anchor          ►  inventing a taxpayer / duplicate attribution
```


> ### Server-authoritative pricing — you cannot underpay
>
> The price of a service lives on the **Service** record (`fee_amount`), tied to a legal citation (e.g. *"Local Government Act CAP 138, 5th Schedule"*). When a bill line references a service, the server **fetches** the rate from that service — any price a client tries to send is **overwritten**. The line amount and the bill total are **recomputed on the server**. A caller chooses *which* service and *how many*; the government's price is non-negotiable. The payment intent then copies its amount from the server-computed total, and refuses any split set that doesn't sum to it exactly.

Other guardrails working alongside it:

- **Immutable proof** — the Payment Event and its verbatim `proof_payload` can never be altered.
- **Log-before-verify** — incoming provider messages are timestamped and stored *before* any validation, so even a forged or replayed message leaves a trace.
- **Idempotency keys** — on assessments and intents, so a network retry can't double-charge.
- **Guarded state machines** — a bill can't skip from Draft to Paid; a closed shift can't silently reopen; a refunded intent is final.
- **Full version history + a unified trace** — every change to a bill, service or payment is recorded, and a single "trace" view reconstructs the entire timeline for an auditor.
- **A public verifier** — anyone with a receipt's QR code can confirm the payment is on file, seeing only safe fields (no ID number, no phone, no account).

## Worked example — Akello's 5,000 shillings

1. **Bill.** Aciro rings up *Daily Market Dues* for Akello. Server fetches the price (5,000), creates assessment `ASMT-2026-05-000123` (Draft), links it to Aciro's shift. → confirmed → **Assessed**.
2. **Intent.** Pay by MTN MoMo from Akello's number. One split: *5,000 → Gulu*. Split total checked against bill total. ✓
3. **Send.** MoMo adapter fires the request-to-pay; Akello's phone prompts for her PIN. Intent → **Sent**.
4. **Pay.** Akello enters her PIN. 5,000 moves from her wallet toward Gulu's account via MTN.
5. **Proof.** MTN's webhook confirms. **Payment Event `PE-2026-05-000045`** is written (Gulu, 5,000, MTN txn id, raw confirmation stored). Intent → **Confirmed**, assessment → **Paid**. Akello can scan her receipt QR to verify it.
6. **Settle.** Overnight, `PE-…045` rolls into Gulu's **MDA Settlement**, then into a **TSA Export** the Treasury submits to IFMIS — landing the 5,000 in the national Treasury Single Account.

Throughout, Sente Rails **recorded, priced, routed, and proved** — but the 5,000 itself went straight from Akello's wallet to Gulu's account. The rail never touched it.

---

*Next: [Connecting to Government Systems](02-government-connections.md) — how the rail reaches NIRA, URA/EFRIS, URSB and the mobile-money networks.*
