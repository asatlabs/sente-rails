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
# Sandbox Terms of Service

**Version:** `sandbox-tos-v1-2026-05-25` · **Last updated:** 25 May 2026

These terms govern your use of Sente Rails sandbox API keys (any key
prefixed `sk_sandbox_`, `rk_sandbox_`, or `pk_sandbox_`). By signing up
at `/signup` or accepting these terms through any other channel you
agree to the items below. The text is short on purpose; nothing in
here surprises someone who has used Stripe / Twilio / Plaid sandboxes
before.

---

## 1. What sandbox keys are for

- **Building, testing, and demonstrating integrations against Sente Rails** — your own, your client's, or your students'.
- **Reading the public catalogue** of agencies, services, sectors, and integration statuses without restriction.
- **Writing test data** (citizens, assessments, payment intents) into your isolated per-integrator sandbox dataset. Other integrators never see your mutations; you never see theirs.
- **Receiving sandbox-side webhooks** for events that happen against your dataset.

## 2. What sandbox keys are not for

- **Production traffic of any kind.** No real citizens, no real money, no real revenue collection. Production work requires a live key — see §5 of `docs/API_SECURITY_DESIGN.md` for the issuance path.
- **Load-testing the shared infrastructure.** Reasonable iteration is fine; sustained high-volume traffic without prior notice may trigger rate limits or a temporary block while we sort it out.
- **Reselling, sublicensing, or embedding the rail itself** in a third-party product without the live-tier Integration Agreement.

## 3. Data you put into sandbox

Even though sandbox is isolated and non-production, please **do not put real Personal Data into it**. Use the seeded synthetic citizens (`CM78001234ABCD` et al; see `/docs/cookbook`) or generate your own throwaway identifiers. We may purge sandbox datasets at any time without notice; that's a feature, not a bug.

## 4. Our commitments

- **Free, indefinitely.** No card required, no time-bombed trial, no upsell. Sandbox is sandbox.
- **Best-effort uptime.** No SLA in sandbox. We try to keep it up; we make no promises.
- **Reasonable notice on breaking changes.** When we change a sandbox-only response shape or behaviour, we'll surface it in the change log at `/docs` and on the workbench overview.

## 5. Things that will get a sandbox key revoked

- **Attempted abuse of the shared rail** — sustained scraping outside published rate limits, credential stuffing, attempts to read other integrators' data.
- **Use of the sandbox to develop tools that violate Ugandan law** — money laundering, identity fraud, unlicensed financial services, anything that would put the operators in front of a Computer Misuse Act 2011 conversation.
- **Sharing the plaintext key publicly** — committing it to a public repo, posting it in a forum, including it in a screenshot. We'll quietly revoke and email you.

Revocations are immediate but not vindictive: contact `asatlabs@gmail.com` if you believe the revocation was an error and want it reviewed.

## 6. Your obligations

- **Keep your plaintext key secret.** Treat it like a password — environment variable, secrets manager, anything except a public git history. If a key leaks, rotate it at `/docs` (or, in Phase 1A, by asking ops to rotate).
- **Don't impersonate the rail.** Don't claim to be Sente Rails-affiliated, sente-rails.space-affiliated, or any government MDA when you aren't.
- **Report security issues responsibly** — email `asatlabs@gmail.com` with the words "security" in the subject line. We'll respond within 72 hours. We don't have a public bug bounty programme yet; that's queued for Phase 4.

## 7. Roadmap to live

When you're ready for production traffic:

- **Tier 3 — Production partner** — full live keys after MoU + KYC + 30-day shadow window. See `/docs/security` for the gates.
- **Tier 4 — Restricted-operations partner** — Treasury operations, refunds above threshold, mass-export ops. Requires named approvers on the rail's side.

There is no automatic graduation from sandbox to live — the gates exist because government data deserves them.

## 8. Termination

You can stop using your sandbox key any time. We can revoke any sandbox key any time, for any of the reasons in §5 or for none, with a courtesy email. Termination doesn't affect the (already-pushed) data on either side.

## 9. Governing terms

This document supplements but does not override:

- The Sente Rails Integration Agreement (`docs/legal/INTEGRATION_AGREEMENT.md`) — currently in draft, applied at live-tier onboarding.
- The Sente Rails Data Processing Agreement (`docs/legal/DPA.md`) — currently in draft, applied at live-tier onboarding when the integrator handles Personal Data on behalf of an MDA controller.
- The applicable Ugandan regulatory framework as documented in `docs/COMPLIANCE_MATRIX.md`.

If anything in this document conflicts with those instruments at live tier, the live-tier instruments govern.

---

*Questions: `asatlabs@gmail.com`. Last reviewed by the Sente Rails operator on 25 May 2026.*
