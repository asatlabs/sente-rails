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
# Glossary

Every term that appears in the handbook, in one place. Government bodies, system entities, and the acronyms.

## Government bodies & national systems

| Term | Meaning |
|------|---------|
| **MDA** | **Ministry, Department, or Agency** — a government body that's owed revenue (Gulu City Council, URA, URSB, NIRA…). |
| **NIRA** | **National Identification & Registration Authority** — issues the national ID. The rail anchors every citizen to a NIRA identity. |
| **NIN** | **National Identification Number** — the 14-character national ID. One human, one NIN, one citizen record. |
| **URA** | **Uganda Revenue Authority** — the tax authority. |
| **EFRIS** | **Electronic Fiscal Receipting & Invoicing System** — URA's official e-receipting system. Issues fiscal receipts (even for cash). |
| **PRN** | **Payment Registration Number** — reserved from URA *before* payment, identifying the liability. |
| **FDN** | **Fiscal Document Number** — issued by EFRIS *after* payment; the receipt's official number, with a verification QR. |
| **URSB** | **Uganda Registration Services Bureau** — the business registry. |
| **OBRS** | **Online Business Registration System** — URSB's system. |
| **OAG** | **Office of the Auditor-General** — the independent watchdog over public money. Read-only oversight on the rail. |
| **MoFPED** | **Ministry of Finance, Planning & Economic Development** — the finance ministry (an oversight consumer). |
| **UBOS** | **Uganda Bureau of Statistics** — consumes statistical aggregates. |
| **NITA-U** | **National Information Technology Authority – Uganda** — runs the government's IT backbone. |
| **UGHub** | NITA-U's **government interoperability bus** — the official broker the rail uses to reach NIRA, URA, URSB, etc. |
| **TSA** | **Treasury Single Account** — the government's master bank account; the final destination of collected revenue. |
| **IFMIS** | **Integrated Financial Management Information System** — the national finance system the rail exports settlements to. |
| **PFMA** | **Public Finance Management Act** — the law; §43 underpins "the rail never holds public money." |
| **PDP Act** | **Personal Data and Privacy Act (2019)** — the data-protection law the consent ledger satisfies. |
| **MoU / KYC** | **Memorandum of Understanding / Know Your Customer** — the institutional agreement + identity checks that move an integrator to live/Production. |

## System entities (the rail's own building blocks)

| Term | Meaning |
|------|---------|
| **Service** | One payable thing an agency offers, with a government-set fee (e.g. "Daily Market Dues — 5,000/day"). |
| **Fee Schedule** | The versioned, legally-cited fee definition behind a service. |
| **Assessment** | A citizen's bill — one trip to the counter, made of one or more lines. |
| **Assessment Line** | A single charge on a bill; its price is *fetched* from the service (server-set). |
| **Payment Intent** | An attempt to pay a bill, by one channel (cash, MoMo, Airtel, card…). |
| **Split** | A routing instruction on an intent — how much goes to which agency's account. |
| **Payment Event** | The provider's confirmation — the immutable, verbatim proof a payment happened. One per split. |
| **Counter Shift** | A clerk's till session, for end-of-day cash reconciliation. |
| **Variance** | Counted cash minus expected cash at shift close (+ over, − short). |
| **MDA Settlement** | A periodic roll-up of one agency's confirmed payments. |
| **TSA Export** | The file of settlements submitted to IFMIS to land money in the Treasury. |
| **Integrator** | An outside developer/software account that uses the public API. |
| **API key** | An integrator's secret credential (Bearer token), carrying scopes. |
| **Scope** | A fine-grained permission on a key (e.g. `payments.initiate`). |
| **Role** | A permission level on a person's staff login (Clerk, Supervisor, Admin, OAG). |
| **Consent Event** | An append-only record proving a citizen consented to a data use, for a stated purpose. |
| **Anomaly Flag** | An automatic fraud tripwire (cash variance, velocity spike, duplicate assessment…). |
| **Adapter** | A swappable plug that connects the rail to one outside system (NIRA, MTN, EFRIS…). |
| **Mode (A/B/C)** | How an agency relates to the rail: A = the rail is its system; B = the rail calls the agency's system; C = read-only oversight consumer. |

## The three front doors

| Door | Internal name | For |
|------|---------------|-----|
| **Counter Stations** | `/work` | Clerks & supervisors at physical desks |
| **Developer Hub / Public API** | `/v1` | Integrator software |
| **Operations Console** | `/ops` | Admins & the auditor |
| *(Self-service)* | `/v1/me` | An integrator managing its own account |

## The five trust principles (quick recall)

1. **Never holds the money** — records & routes; cash flows citizen → provider → Treasury.
2. **One identity, anchored to NIRA** — no ghost taxpayers.
3. **The server sets the price** — you can't underpay.
4. **Every payment leaves immutable proof** — never edited, never deleted.
5. **Oversight can't tamper** — the auditor watches but cannot change.
