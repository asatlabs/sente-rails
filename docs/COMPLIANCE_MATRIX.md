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
# Sente Rails — Regulatory Compliance Matrix

**Standalone one-pager · companion to the Program Brief**

| | |
|---|---|
| Document | Compliance Matrix |
| Maintained by | ASAT LABS (Geoffrey Oketwangwu) |
| Updated | 2026 |
| Live sandbox | https://sente-rails.space |
| Source | https://github.com/asatlabs/sente-rails |

---

Each row below maps a Ugandan regulatory framework to the Sente Rails architectural posture. Implementation is verifiable against the live sandbox at https://sente-rails.space. The underlying data model is held in the private development repository and is not part of this disclosure build.

| # | Regulation | Sente Rails posture | Evidence |
|---|---|---|---|
| 1 | **Personal Data and Privacy Act 2019** | Consent is captured as structured metadata on every citizen record (a consent flag, the time it was recorded, and the recording officer). National Identification Numbers are never used as URL parameters or document names — they live only in indexed body fields. Right-to-erasure is honoured via soft-archive (status flip + audit trail) so referential integrity stays intact for paid receipts. Per-purpose consent (separate flags for fiscal, identity, and oversight scopes) is sequenced for the Q3 production hardening pass. | Citizen consent model; verifiable at `/v1/citizens` against the live sandbox |
| 2 | **Tax Procedures Code Act 2014 §73A–73B (EFRIS)** | Every service flagged as EFRIS-taxable routes through the EFRIS fiscal adapter at assessment time. Each assessment line carries a per-line Fiscal Document Number. The sandbox round-trip — generate PRN, post invoice, retrieve FDN — is exercised live end-to-end. URA-EFRIS sits at Sandbox status today, and swaps to Live the day production credentials are granted. | `sente_rails/adapters/fiscal/uganda_efris.py`; sandbox call surfaced at `/v1/integrations` |
| 3 | **Public Finance Management Act 2015 §43 (no-public-money)** | The rail never holds public money. Citizen payments flow directly from the citizen's mobile wallet (or card, or bank) to a licensed aggregator on a per-MDA payable account. Sente Rails maintains a receivable-only General Ledger and propagates receipts via webhook. Cross-MDA transactions split at the aggregator, never at Sente Rails. No single rail wallet ever accumulates revenue. | Receivable-only ledger; per-MDA payable accounts; payment split performed at the aggregator |
| 4 | **e-Government Interoperability Framework (e-GIF)** | API-first by construction. The complete `/v1` surface is REST/JSON, documented in OpenAPI 3.1. The UGHub gateway adapter is scaffolded for the standard NITA-U integration path; production rollout follows the UGHub MoU procedure. | Live OpenAPI explorer at https://sente-rails.space/docs/explorer; `sente_rails/adapters/gateway/uganda_ughub.py` |
| 5 | **Access to Information Act 2005** | Oversight bodies (OAG, MoFPED, UBOS, MoLG) operate as Mode C Read Consumers — they read data scoped to their statutory remit through dedicated endpoints, never collecting on behalf of any MDA. Aggregate statistics are open-by-default; itemised reads require role-scoped credentials with full audit logging. | Role-scoped oversight reads; `/agencies` filtered by inquiry status |
| 6 | **Computer Misuse Act 2011 (as amended 2022)** | Authentication logs are immutable, with an application audit entry on every state change. Rate limiting at the nginx edge plus per-endpoint application-level throttling. The administrative back-end is not exposed publicly — it returns 404 at the edge, so there is no public administrative surface. Intrusion detection and formal penetration testing are sequenced for the pre-production hardening pass (Q3 2026). | `sente_rails/auth.py` (role-aware redirects); edge-level admin block + security headers; immutable application audit log |
| 7 | **National Payment Systems Act 2020** | All payment processing is mediated by licensed aggregators — no direct money-handling at any point in the rail. Adapters today: MTN MoMo (Sandbox live), Airtel Money (Sandbox pending), Pesapal (Planned). Card and bank settlement routes are scaffolded for production. Sente Rails never registers as a PSP — by architectural posture it does not need to. | `sente_rails/adapters/payment/*.py`; aggregator-mediated settlement, no rail-side wallet |

---

## Beyond the matrix — adjacent commitments

**Source transparency under access** — the full source is available to authorised government reviewers and auditors under controlled read-only access. Government auditors do not have to take a vendor's word; they can read the rail end-to-end. This addresses the procurement principle of supplier transparency under the Public Procurement and Disposal of Public Assets Act 2003 by removing the "black box" failure mode.

**Sovereign hosting** — the rail is designed to run on the NITA-U sovereign government cloud. No critical-path dependency on any foreign vendor. The development sandbox runs in a regional facility today; the production target is the National Data Centre.

**Localisation** — receipt rendering supports English by default, with Luganda and Acholi toggles on the near-term roadmap and Luo, Runyankole, and Ateso as fast-follow. Localisation is per-receipt at render time, not site-wide.

**Procurement-friendly delivery** — the 14-day-from-MoU velocity claim (see Brief §6) means an MDA pilot fits inside a single procurement quarter without the multi-year deployment commitment typical of foreign ERP solutions.

---

*Companion document: PROGRAM_BRIEF.md (architectural overview). `docs/diagrams/*.mmd` provides five diagrams covering layered architecture, the integration map, and the three reference workflows.*
