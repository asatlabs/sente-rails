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
# Sente Rails — API Access, Sandbox, and Key Security

**Design specification · v0.2 · 2026-05-25**

> Companion to `PROGRAM_BRIEF.md` and `COMPLIANCE_MATRIX.md`. Lives in
> the repository as the canonical spec for how integrators get on the
> rail and how Sente Rails protects what they touch.
>
> **Changelog**
> - **v0.2 (2026-05-25)** — Added §6.5 (citizen portal OAuth Authorization
>   Code flow with NIN + phone-OTP) and §10 (pricing & commercial model
>   with five tiers + special programmes). Removed corresponding entries
>   from §12 Open decisions.
> - **v0.1 (2026-05-25)** — Initial spec.

---

## 1. Goals

Four constraints shape every decision below. They sometimes pull against each other; the design resolves the conflicts explicitly.

1. **Government-grade security.** Defence in depth, mutual TLS for high-risk paths, least-privilege scopes, immutable audit log, rotation discipline, anomaly detection. Defensible to the most demanding review.
2. **Stripe-class developer experience.** Self-serve sandbox in under five minutes, copy-pasteable code samples, clear errors with stable codes, predictable rate limits, webhooks that just work. Nothing in the security posture should make the first ten minutes painful.
3. **Honest progression.** Every key carries an explicit environment and tier. A sandbox key cannot reach production data; a production key cannot be issued without the gates that justify it. The integrator always knows which dataset they are touching.
4. **Compliance integration.** Each control below maps to a specific Ugandan regulatory framework — Personal Data and Privacy Act 2019, National Payment Systems Act 2020, Tax Procedures Code Act 2014 §§73A–B, Computer Misuse Act 2011, e-Government Interoperability Framework. Compliance is the *output* of the architecture, not a separate audit checklist taped on.

---

## 2. The integrator journey — five tiers

Every integrator sits in exactly one tier at any moment. The tier determines what keys they may hold, what data those keys may touch, and what controls surround the operations they may execute.

| Tier | Audience | Access | Gate |
|---|---|---|---|
| **0 — Anonymous catalogue** | Anyone with a browser | Public-read endpoints (`/v1/mdas`, `/v1/services`) | None |
| **1 — Registered developer** | A person evaluating the API | Sandbox keys, full sandbox dataset, sandbox webhooks | Email verification + Terms of Service acceptance |
| **2 — Onboarding partner** | An MDA or commercial integrator preparing to go live | Sandbox + shadow-mode production (calls logged, side effects allowed) | Signed Memorandum of Understanding + KYC + technical-lead identity verification |
| **3 — Production partner** | Fully-vetted live integrator | Full production scopes per Integration Agreement; standard SLA | Successful 30-day shadow window + security review of integrator's webhook endpoint |
| **4 — Restricted-operations partner** | Treasury, refunds, mass operations, oversight Mode C reads | Additional scopes and approval workflows on top of Tier 3 | Per-operation approval policy + named approver(s) on file |

Tier movement is one-way under normal operation: 0 → 1 → 2 → 3 → 4. Demotion (e.g. revoke production access pending incident review) is operator-initiated and produces an audit-log entry visible to the integrator.

---

## 3. Key model

### 3.1 Key types

| Type | Prefix | Use |
|---|---|---|
| **Secret key** | `sk_` | Server-side, full power within the key's scope set. Never exposed to a browser. |
| **Restricted key** | `rk_` | Server-side, narrowed scopes for specific automation. Best practice over reusing `sk_` for narrow jobs. |
| **Publishable key** | `pk_` | Client-side embedding (a citizen-facing widget, a kiosk). Read-only, never carries write power. |
| **Webhook signing secret** | `whsec_` | Per-endpoint shared secret used for HMAC-SHA256 outbound signature. Verification on the integrator side. |

### 3.2 Key format

Every key is structured so a leaked credential is identifiable instantly — by humans, by secret-scanning tools (GitGuardian, GitHub secret scanning, TruffleHog), and by the rail's own pre-receive hooks for any operator who tries to commit one.

```
sk_live_2026_zZ9aB8cD7eF6gH5iJ4kL3mN2oP1qR0sT
^^ ^^^^ ^^^^ ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
|   |    |   payload: 32 chars, base62, ~190 bits entropy
|   |    └── issuance year (rotation tracking, anomaly detection on stale years)
|   └────── environment: live / sandbox
└────────── type: sk / rk / pk / whsec
```

The prefix carries no secret material; the entropy is entirely in the payload. The full key is shown to the integrator **exactly once**, at creation time, with copy-to-clipboard + a "I have stored this securely" confirmation. Thereafter the dashboard shows only the prefix and the last four characters.

### 3.3 Storage (server side)

- **The rail stores only the SHA-256 hash of the key.** The plaintext is generated once, returned to the caller, and discarded.
- **Lookup on auth:** SHA-256 the incoming Bearer token, query the API Key record by hash. Constant-time comparison defends against timing attacks.
- **Implications:** if our database is fully compromised, the attacker cannot use the keys. Plaintext keys never sit at rest.
- **Operator override:** there is no "show me the original key" function for support staff. Forgotten keys must be rotated.

### 3.4 Scopes (least-privilege authorization)

Every key carries an explicit scope set. Default for self-serve sandbox keys is the minimal sandbox read scope; every additional scope is opt-in.

| Scope | Grants |
|---|---|
| `catalogue.read` | List MDAs, services, sectors |
| `citizens.read` | Resolve citizens by NIN; read citizen profiles |
| `citizens.write` | Create or update citizen records (sandbox: per-integrator; production: gated) |
| `assessments.read` | Read assessment + lines for the integrator's records |
| `assessments.write` | Create assessments |
| `assessments.cancel` | Cancel pre-payment |
| `payments.read` | Read payment intents + events + splits |
| `payments.initiate` | Initiate a charge via the configured aggregator |
| `payments.refund` | Refund (Tier 4 + approval workflow gate for amounts above threshold) |
| `webhooks.manage` | Register, update, retry webhook endpoints |
| `oversight.read.collections` | Mode C — OAG / MoFPED scope on collections data |
| `oversight.read.treasury` | Mode C — MoFPED treasury feeds |
| `oversight.read.statistics` | Mode C — UBOS aggregate statistics |

Scopes are additive. A key with `assessments.write` does not implicitly carry `payments.initiate`; the integrator may legitimately want one without the other (e.g. an assessor that hands off to a separate cashier system).

### 3.5 Rotation

| Key type | Default expiry | Renewal window |
|---|---|---|
| Sandbox keys | 90 days | Last 14 days |
| Live secret keys | 365 days | Last 30 days |
| Webhook signing secrets | Never expire by default; rotatable on demand | — |

Rotation supports the **"rolling" pattern**: when an integrator triggers a rotation, the rail issues a new key, marks the old key as `rolling`, and accepts both for the rotation grace window (default 24 hours; configurable up to 7 days for high-risk integrators). After the window, the old key is moved to `revoked` state.

The rail sends webhook + email + dashboard reminders at T-30, T-7, and T-1 days from expiry.

### 3.6 Revocation

Any key may be revoked instantly, three ways:

1. Integrator dashboard — primary path. Single click, immediate effect.
2. `DELETE /v1/api-keys/{id}` — API self-service.
3. Operator console — for incident response. Requires reason code + supervisor co-sign for production keys.

A revoked key returns `401 unauthorized` with a stable `error.code = "key_revoked"` so the integrator can distinguish it from `unauthorized` (e.g. bad header) and `forbidden` (e.g. wrong scope).

---

## 4. Environments

### 4.1 Sandbox

A sandbox key with prefix `sk_sandbox_` hits a parallel dataset that **shares the catalogue** (46 MDAs, 14 services, 15 seeded citizens) but **isolates mutations** per integrator. Two integrators creating different test assessments will not see each other's data — but both will see the same MDA catalogue and the same seeded citizens.

This is the **hybrid pattern** (catalogue shared, mutations per-integrator). Stripe's test mode works the same way: test card numbers are universal, but test customers in one merchant's account don't leak to another's.

#### 4.1.1 Test resources

Documented in `/docs/cookbook` and reproduced here for the spec:

| Resource | Identifier | Behaviour |
|---|---|---|
| Test citizen (counter-led demos) | NIN `CM78001234ABCD` | John Patrick Mukasa, Gulu |
| Test citizen (cross-MDA) | NIN `CM85042134GULU` | Patrick Okello Akena |
| Test MoMo MSISDN — success | `+256000000001` | Always confirms after 2s |
| Test MoMo MSISDN — insufficient balance | `+256000000002` | Always fails with `INSUFFICIENT_FUNDS` |
| Test MoMo MSISDN — timeout | `+256000000003` | Aggregator does not respond; tests retry logic |
| Test MoMo MSISDN — fraud-flagged | `+256000000004` | Returns `BLOCKED_BY_AGGREGATOR` |

The full MTN MoMo sandbox MSISDN catalogue (`+256772123456` and similar) continues to work for general happy-path testing.

#### 4.1.2 Sandbox-only behaviours

- **Faster webhook retries:** sandbox retry ladder is 5s / 30s / 2min / 10min (vs. production 30s / 2min / 15min / 1h / 4h / 12h up to 72h). Sandbox integrators iterate faster.
- **Force-error header:** `X-Sente-Force-Error: rate_limited` on a sandbox-keyed request forces that specific error response. Supports `validation_failed`, `forbidden`, `not_found`, `conflict`, `rate_limited`, `upstream_timeout`, `upstream_failure`. Production keys ignore the header.
- **Time-travel:** `POST /v1/sandbox/advance-clock { "to": "2027-01-01T00:00:00Z" }` advances the sandbox's logical clock for the integrator's dataset, firing any scheduled webhooks that would have occurred between now and then. Sandbox-only.
- **Dataset reset:** `POST /v1/sandbox/reset` deletes the integrator's sandbox mutations and re-seeds from the shared baseline. Idempotent; non-recoverable; confirmation token required.
- **No real money:** the MoMo and Airtel adapters in sandbox mode route to the aggregator sandboxes. EFRIS sandbox PRNs are non-binding.

#### 4.1.3 Self-serve issuance

Sandbox keys are issued instantly. Flow:

1. Integrator visits `sente-rails.space/signup` and provides email + organisation name + technical-lead name.
2. Email verification round-trip.
3. Acceptance of the **Sandbox Terms of Service** (separate from production agreement; covers data-handling expectations even in sandbox).
4. Sandbox dashboard auto-provisioned, default `sk_sandbox_...` key created with `catalogue.read + citizens.read + assessments.read + assessments.write + payments.read + payments.initiate + webhooks.manage` scope set.
5. The integrator may add scopes as needed up to the sandbox cap (which excludes `oversight.read.*` — Mode C is production-only).

This is the entire Tier 0 → Tier 1 path: minutes, not days.

### 4.2 Production

A production key with prefix `sk_live_` hits the real rail. Production access is **never self-serve**. The gates are documented in §5.

---

## 5. Live key issuance

The path from Tier 1 to Tier 3 is deliberately deliberate. Every gate exists to make a specific risk concrete to the integrator and the rail at the same time.

### 5.1 Application

The integrator submits a structured application via the dashboard or by emailing the operations team. Required fields:

- **Organisation identity** — name, registration number (URSB for companies, MDA letterhead for government bodies), physical address, primary contact, technical lead.
- **Use case** — which MDAs they intend to call, on whose behalf, for which citizen-service workflows.
- **Authority** — for partner integrators, a letter from each MDA whose data they intend to read or whose endpoints they intend to call on behalf of citizens. For MDAs themselves, the application is its own letter.
- **Webhook endpoint** — full URL, certificate fingerprint if mTLS is to be used.
- **Anticipated volume** — daily peak + monthly total; informs rate-limit configuration.

### 5.2 Memorandum of Understanding

Three documents make up the framework an integrator signs:

- **Integration Agreement.** Scope of access, allowed operations, prohibited operations, termination clauses.
- **Data Processing Agreement.** Personal Data and Privacy Act 2019 — the integrator's role as data processor for Citizen records they handle on behalf of an MDA controller.
- **Service Level Agreement.** Rate-limit allocation, support response times, planned-maintenance windows, incident-notification commitment in both directions.

The framework is published in repository under `docs/legal/` (in draft; finalised post-MoU with the first commercial integrator).

### 5.3 Know-Your-Customer

Three identity pillars must be verified:

- **Organisation.** URSB business registration certificate or MDA establishment instrument. We verify against URSB and the OAG's published list.
- **Beneficial ownership.** For private-sector integrators, the registered shareholders (URSB beneficial-ownership filing). We compare to sanctions lists; we do not transact with sanctioned entities.
- **Technical lead.** NIN-verified identity of the named technical contact who will hold the production credentials. NIRA cascade through UGHub (the same path as citizen verification on the rail itself).

### 5.4 Security review

The integrator's webhook endpoint is examined before any production webhook fires. We check:

- TLS configuration — TLS 1.2+, modern cipher suites, valid certificate.
- Signature verification — we send a test event with a tampered signature and confirm it is rejected with `4xx`.
- Replay protection — we send a duplicate event five seconds apart and confirm deduplication.
- Failure mode — we send an event the integrator's parser should reject and confirm the response is `4xx` not `5xx` (so we don't retry a permanent failure forever).

A failed check is feedback, not refusal. The integrator fixes and resubmits.

### 5.5 Shadow mode (the first 30 days)

The integrator's live key is issued and works, **but** for the first 30 days the rail also runs every live call through anomaly detection with elevated sensitivity:

- Volume spikes ≥ 3× declared anticipated peak → soft-block + page operator.
- Hour-of-day anomalies (calls at 03:00 EAT when none have been seen at that hour) → soft-block + page operator.
- IP changes → operator notification (not block — VPN/cloud IPs change).
- Error-rate anomalies (>10% 4xx for a previously-clean integrator) → operator notification.

Shadow mode is invisible to the integrator unless they trip a threshold. After 30 days of clean operation, the integrator moves to standard monitoring.

### 5.6 Tier 4 — restricted operations

Some operations are not protected by a scope alone. They require a **workflow** — a per-operation approval chain that pauses execution until a named approver signs off.

| Operation | Workflow |
|---|---|
| Refund of payment intent > UGX 10,000,000 | Integrator API call lodges the refund as `pending_approval`; named MDA finance officer (per-MDA, registered with the rail) approves via dashboard; the rail then executes against the aggregator. |
| Cancellation of paid assessment | Two-signature workflow: assessing clerk + supervisor of record. |
| Mass export (> 1,000 records) | Integrator submits a justification + a retention pledge; OAG-shaped audit log entry created; export key valid for 24h, IP-locked. |
| Treasury operations (sweep, reconciliation override) | Operator-initiated only, with multi-party sign-off from MoFPED and the affected MDA's treasurer. |

These workflows are visible in the audit log to all parties whose data is touched.

---

## 6. Authentication mechanisms

Three independent mechanisms, used in combination depending on the endpoint's risk class.

### 6.1 Bearer tokens (default)

- All authenticated endpoints accept `Authorization: Bearer <key>`.
- The token is validated by SHA-256 hash lookup (see §3.3).
- Scope check against the resource being accessed; insufficient scope returns `403 forbidden` with `error.code = "forbidden"` and the missing scope named in `error.details`.

### 6.2 OAuth 2.0 client_credentials

For partner platforms — city ERPs, enterprise integrators — the rail issues OAuth 2.0 `client_credentials` tokens with configurable scopes. The flow follows RFC 6749 §4.4 with no client-side deviations; any standard OAuth library works without modification. Short-lived access tokens (1 hour) reduce blast radius if a token leaks; the integrator's client_id + client_secret are the long-lived credentials they protect.

### 6.3 Mutual TLS (mTLS)

A subset of high-risk endpoints requires mutual TLS in addition to the Bearer token:

- Payment confirmation webhooks (inbound from aggregators).
- Oversight read endpoints under the OAG scope.
- Credential rotation endpoints.
- Tier 4 restricted-operations endpoints.

The integrator registers a client certificate fingerprint with the rail in advance; the rail pins to that fingerprint set. Production-only.

### 6.4 Multi-factor for dashboard

Dashboard operations carry their own MFA layer on top of session auth:

- View an existing live secret key (after creation) → MFA challenge in the last 5 minutes.
- Rotate a live key → MFA challenge + reason code.
- Register a new webhook endpoint → MFA + email confirmation round-trip.
- Add a Tier 4 named approver → MFA + supervisor co-sign.

MFA is TOTP (Google Authenticator, Authy, etc.) by default. WebAuthn passkeys and hardware tokens (YubiKey) are supported. SMS-OTP is *not* offered — SIM-swap risk is too high for a system that issues government-data credentials.

### 6.5 Citizen portal OAuth (Authorization Code flow)

The citizen-facing portal at `/portal` is itself an OAuth 2.0 authorization server. Citizens authenticate with NIN + phone-OTP; third-party applications (a tax-filing service, a financial-aggregator app, a civic-monitoring tool) can request scoped, time-bound access to a citizen's records on the citizen's explicit consent.

The flow follows RFC 6749 §4.1 (Authorization Code) with PKCE (RFC 7636) mandatory — there is no implicit-flow variant offered. PKCE closes the authorization-code interception attack class even for confidential-client integrators that don't strictly need it.

**Login factor.** NIN + phone-OTP. The rail looks up the citizen's registered phone number, generates a 6-digit code, and sends it via SMS through the citizen's MNO (or NITA-U's SMS gateway when that becomes available). 5-minute code validity, 3-attempt cap, then 15-minute lockout. SIM-swap risk is acknowledged and mitigated by anomaly detection on consent grants from new devices and by re-prompting for OTP on any consent grant that crosses a sensitivity threshold (e.g. financial data scopes).

**Endpoints.**
- `GET /portal/oauth/authorize` — the citizen-facing consent screen. The integrator's `redirect_uri` must be pre-registered and exact-match validated. The screen displays the integrator's verified name + logo, the scopes requested, and the citizen's NIN + name for confirmation.
- `POST /portal/oauth/token` — token exchange. Returns a 30-minute access token + a 7-day refresh token, both scoped to the consent grant.

**Citizen-scoped scopes.** Separate scope namespace from the integrator API:

- `citizen.self.profile.read` — read core profile (name, NIN, district, registered phone)
- `citizen.self.payments.read` — read this citizen's payment history across all MDAs
- `citizen.self.assessments.read` — read this citizen's open + paid assessments
- `citizen.self.receipts.read` — read receipt + FDN data on settled payments
- `citizen.self.consents.manage` — view + revoke prior consents to other apps (always granted alongside any other scope; citizens must be able to manage their own consent grants without re-authenticating)

**Consent revocation.** Every active consent is visible to the citizen in `/portal/connected-apps`. Revocation is single-click; the revoked refresh token becomes invalid immediately, and any access token issued against it is rejected at the next request.

**Federated identity (future).** If NITA-U or another national identity provider stands up a citizen single-sign-on at the national level, Sente Rails will integrate as an OIDC relying party. Until then, NIN + phone-OTP is the login factor. The integration boundary is well-defined; the federation switch is operator-side, transparent to citizens.

**UGHub separation.** UGHub is a server-to-server government integration gateway used for the rail's *outbound* calls (NIRA identity lookups, future URSB / NSSF / other Mode B integrations). Citizens never interact with UGHub; UGHub is not a citizen identity provider. The two systems are orthogonal — nothing in this portal flow depends on UGHub.

**Phase.** Citizen portal OAuth ships in Phase 4 (Q4 2026) as part of production hardening. The portal itself is a Phase 3 deliverable. Integrator OAuth `client_credentials` (§6.2) is independent and ships in Phase 1.

---

## 7. Authorization (scopes — full reference)

See §3.4 for the canonical list. Two operational principles govern scope assignment:

1. **Default deny.** A key has only the scopes explicitly granted. There are no implicit scopes; there is no superuser key. Operator-issued keys for emergency response also carry explicit scopes (typically broad, but enumerable and audit-loggable).
2. **Per-MDA delegation.** A partner integrator can hold a `payments.initiate` scope that is restricted by MDA: e.g. valid for URA + URSB but not for KCCA. The MDA dimension is part of the scope, not separate from it. This is how the rail honours the "Authority" letter requirement in §5.1 — an integrator authorised by URA cannot call Gulu City endpoints just because their key has `payments.initiate`.

---

## 8. Operational security

### 8.1 Audit log

Every authenticated call writes an audit-log entry with: key ID, integrator ID, requested scope, granted scope, endpoint, method, request body hash (not plaintext), response status, latency, source IP, request ID. Failed authorization attempts log with the same shape — the rail audits the rejections, not only the successes.

Audit entries are append-only at the database level (no `UPDATE` privilege on the table for the application user; only the daily-archive job has truncate authority, and that is restricted by date).

### 8.2 Anomaly detection

Per-integrator baselines drive a real-time anomaly model. Triggers:

- **Volume.** Sustained 3× baseline over 5 minutes, or 10× baseline over 30 seconds.
- **Time-of-day.** Calls in a 1-hour window where the integrator has not transacted in the past 30 days.
- **IP.** New IP ASN where ≥ 95% of the integrator's prior traffic came from a different ASN.
- **Error rate.** Sustained 4xx > 10% over 5 minutes for an integrator whose prior 30-day average is < 1%.
- **Geographic.** Origin country change without an operator-recorded travel/expansion note.

A trigger does not block — it pages an operator and elevates the integrator to a 24-hour heightened-monitoring window in which a second trigger does soft-block until manual review.

### 8.3 Rate limiting

Per-key bucketed limits, refilled continuously:

- Read endpoints: 120 requests / minute / key.
- Write endpoints: 60 requests / minute / key.
- Payment endpoints: 30 requests / minute / key (the aggregator side has its own throttle on top).
- Tier 4 endpoints: 10 requests / minute / key.

Throttle hits return `429` with `Retry-After`, `X-Sente-RateLimit-Limit`, `X-Sente-RateLimit-Remaining`. Per-integrator limit overrides are operator-configurable; tier 3 integrators with a documented use case can be granted up to 10× the defaults.

### 8.4 IP allowlisting (optional, production-only)

Each production key may carry a CIDR allowlist. Default is open; recommended is the integrator's server outbound IP set. The dashboard shows recent source IPs for the key so an integrator can populate the allowlist accurately.

### 8.5 Quarterly access review

Once per quarter, the rail emails each integrator a summary of:

- Every key the integrator currently holds.
- The scope set on each key.
- The last-used timestamp on each key.
- Webhook endpoints registered to the integrator.

The integrator must affirm continued need within 30 days. Keys not affirmed move to `pending_revocation` with a 30-day grace window, then auto-revoke. Operations of record are notified at each step.

---

## 9. Compliance integration

Each major Ugandan regulatory framework maps to specific controls above:

| Framework | Controls |
|---|---|
| **Personal Data and Privacy Act 2019** | §3.4 scopes (least privilege on Citizen data); §5.2 Data Processing Agreement; §8.1 audit log; §8.5 quarterly access review; §5.3 KYC of technical leads. |
| **National Payment Systems Act 2020** | §4 sandbox model (aggregator-mediated only); §5.4 webhook security review; §6.3 mTLS on payment paths; §5.6 refund approval workflow. |
| **Tax Procedures Code Act 2014 §§73A–73B** | The EFRIS fiscal adapter is invoked at assessment time for any service flagged as EFRIS-taxable, regardless of the calling integrator's intent — fiscalisation is a property of the service catalogue, not a scope the integrator can omit. |
| **Computer Misuse Act 2011 (as amended 2022)** | §8.1 immutable audit log; §6.4 MFA on sensitive dashboard ops; §8.3 rate limiting; §3.3 hashed-only storage. |
| **e-Government Interoperability Framework** | API-first by construction; OpenAPI 3.1 spec at `/api-explorer`; UGHub gateway adapter scaffolded; §3.2 prefix scheme aligns with the standardisation push for cross-MDA credential conventions. |
| **Access to Information Act 2005** | §3.4 oversight scopes (Mode C); audit log read access for Mode C consumers; aggregate statistics open by default. |
| **Public Finance Management Act 2015 §43** | No public money on the rail — payments mediated by aggregators (§4.1, §6.3); no rail-side wallet. |

The architecture *is* the compliance posture. There is no separate "compliance layer" that could be misconfigured or bypassed.

---

## 10. Pricing & commercial model

Two non-negotiable principles before the numbers.

- **No transaction take-rate.** Sente Rails never holds public money under Public Finance Management Act 2015 §43. Charging a percentage of payments routed through the rail would trip the "we're effectively a PSP" line and undo the entire no-public-money architectural posture. Pricing is subscription or per-call only, never per-percent-of-transaction.
- **MDAs free, always.** Government bodies — ministries, authorities, agencies, city councils, sub-counties, districts — pay nothing. They are the constituency the architecture exists to serve. Charging them would invert the sovereignty positioning that distinguishes Sente Rails from foreign vendors.

The pattern is the established freemium SaaS-API model used across Stripe, Twilio, Plaid, Algolia, GitHub, and Mintlify: a free tier generous enough for genuine experimentation, paid tiers calibrated to integrator scale, and an enterprise tier with custom terms for the largest partners.

### 10.1 Tiers

| Tier | UGX / month | USD ≈ | Production calls / month | Sandbox | Support | mTLS + IP allowlist | Audience |
|---|---|---|---|---|---|---|---|
| **Free** | 0 | 0 | 10,000 | unlimited | community + docs | — | Solo devs, hobby projects, prototyping, MDA pilots |
| **Developer** | 100,000 | ~$28 | 100,000 | unlimited | email, business hours | — | Startups, small studios, NGOs |
| **Business** | 1,000,000 | ~$280 | 1,000,000 | unlimited | email + Slack, priority, 99.5% SLA | ✓ | Banks, established ERPs, multi-MDA partners |
| **Enterprise** | from 9,000,000 | from ~$2,500 | custom | unlimited | dedicated contact, 99.9% SLA, custom audit retention | ✓ | Large platforms, national banks, regional integrators |
| **MDA** (any UG gov body) | 0 | 0 | unrestricted | unlimited | direct ops line | ✓ | Government partners |

The Free tier's 10,000 calls/month is genuinely useful — at one call per transaction it covers roughly 330 transactions per day. A single market kiosk, a small clinic, or a working prototype operates inside the Free tier indefinitely. Solo developers never need to pay until they have found product-market fit.

The Business tier at one million UGX per month (≈ $280) positions against the integrator man-hours saved: a single developer integrating against Sente Rails replaces months of bilateral integration meetings with URA + URSB + NIRA + KCCA and the relevant aggregators. The fee is rounding error on the engineering cost it displaces.

### 10.2 Overage and annual prepay

Calls above the tier cap meter at 10 UGX per call (≈ $0.0027). Overage is capped automatically until the integrator either upgrades or signs an overage-billing addendum — there are no surprise bills. Annual prepayment receives two months free (effective 16.7% discount); monthly billing is also offered without commitment.

### 10.3 Special programmes

- **Academic, civic-tech, registered NGO** — 90% off the Developer or Business tier. Proof required (URSB registration as a non-profit; university or research-institution letterhead for academic).
- **Startup credit** — UGX 1,000,000 in production calls free for the first 12 months for any business registered through Sente Rails itself. Closes the loop: registering through the rail earns you using the rail.
- **East African Community early adopters** — the first three EAC member-state pilots (when the rail extends beyond Uganda) receive the Business tier free for 12 months alongside engineering support for their Country Profile build.

### 10.4 Billing mechanics

- **Payment channels.** MoMo, Airtel Money, bank transfer. No card-network dependency. Citizens never pay Sente Rails — only integrators do.
- **Invoicing.** VAT-compliant invoices on every payment. Annual statements for accounting reconciliation.
- **Currency.** Pricing published in UGX; foreign integrators paying in USD use the daily Bank of Uganda reference rate at invoice generation.
- **Transparency.** All published rates are firm. There is no per-customer rate negotiation behind the published tiers, with one exception — Enterprise contracts are bespoke by definition.

### 10.5 What this funds

The fee structure supports a deliberately modest operation:

- A small operations team (3–5 people) for support, security review, MoU + KYC processing, incident response, and quarterly access reviews.
- Sandbox and production infrastructure on the sovereign cloud.
- The annual third-party penetration test (Phase 4 deliverable).
- Ongoing investments: maintenance, documentation, the EAC-extensibility build, and the bug bounty programme.

The model is intentionally not designed to maximise revenue. Sente Rails is government infrastructure with a modest commercial-integrator funding leg — not a SaaS chasing growth metrics.

---

## 11. Phased implementation roadmap

The above is the destination. The build sequencing:

### Phase 1 — Foundation (the next 30 days)

The minimum that makes Tier 1 real and the Tier 3 path believable.

- **API Key model.** Hashed-key storage with an owning integrator, an explicit scope set, environment + tier, and full lifecycle/rotation state. *(Exact field definitions are withheld from this disclosure build.)*
- **Integrator model.** Organisation identity, tier, MoU + KYC status, a technical-lead binding, and webhook + IP-allowlist configuration. *(Exact field definitions are withheld from this disclosure build.)*
- **Bearer middleware.** SHA-256 hash lookup; scope check against the called endpoint; audit log write; `last_used_at` bump.
- **`/v1/api-keys` endpoints** — list, create (returns plaintext once), revoke, rotate. Operator-only at first.
- **Sandbox signup landing.** Email + verification + ToS acceptance + first sandbox key issued.
- **Dashboard surfaces in the workbench** — key list, key creation, revocation, prefix + last-4 display.

### Phase 2 — Sandbox depth (the 30 days after that)

- Sandbox dataset isolation (per-integrator mutation namespace).
- Test MSISDNs with deterministic behaviours.
- Force-error header.
- Sandbox reset endpoint.
- Sandbox dashboard with usage charts.

### Phase 3 — Live issuance (Q3 2026)

- MoU workflow: digital signature flow, template repository in `docs/legal/`.
- KYC integration: URSB beneficial-ownership API call (via UGHub if available; otherwise CSV upload pending API readiness).
- Security review automation: synthetic webhook events against the integrator's endpoint with pass/fail report.
- Shadow-mode flag on the Integrator model with anomaly thresholds.
- mTLS endpoint registration (client cert fingerprint per integrator).

### Phase 4 — Production hardening (Q4 2026)

- Per-key IP allowlist enforcement at nginx edge (not just application).
- Anomaly detection model with per-integrator baselines.
- Quarterly access review automation (email + dashboard prompts).
- Tier 4 approval workflow model + UI.
- Time-travel sandbox endpoint.
- WebAuthn passkey support for dashboard MFA.
- Penetration test by independent third party; results published under `docs/security/pentest-2026-XX.pdf`.

### Phase 5 — Beyond (2027+)

- ISO 27001 readiness assessment.
- SOC 2 Type 1 → Type 2 path if commercial integrators justify it.
- Federated identity via NITA-U government identity broker for dashboard login.
- East African Community per-country key namespacing (`sk_live_ug_...`, `sk_live_ke_...`) when the rail extends beyond Uganda.

---

## 12. Open decisions

Decisions that will affect the build but are not yet locked. Tracked here so they are not forgotten and so the bias on each is visible.

| # | Question | Current bias |
|---|---|---|
| 1 | Self-serve sandbox vs. operator-issued sandbox? | Self-serve at Tier 1, with rate-limited signup endpoint to prevent abuse. |
| 2 | Should the time-travel endpoint exist outside sandbox? | No — sandbox-only is firm. Production time is wall-clock time. |
| 3 | Federated dashboard login via NITA-U? | Yes long-term; standard email/password + MFA in the meantime. |
| 4 | Split the dashboard from the rail into a separate repo? | The dashboard is part of the workbench (already shipped); no separate repo. |
| 5 | Per-MDA encryption keys for at-rest payloads? | Defer — defence in depth via filesystem encryption + operator separation is sufficient for v1; per-MDA key wrapping when the regulatory framework explicitly requires it. |
| 6 | Bug bounty programme? | Yes, public, modest payouts for confirmed vulnerabilities. Stand up after Phase 3 production hardening lands. |

> **Resolved 2026-05-25** (folded into the spec body):
> - *Pricing for commercial integrators* — now §10. Five-tier subscription model, MDAs always free.
> - *Citizen-portal OAuth flow* — now §6.5. Authorization Code with PKCE + NIN + phone-OTP login.

---

## 13. References

Patterns and conventions Sente Rails adopts (or adapts) from established systems:

- **Stripe** — key prefix scheme, hashed storage, test mode dataset isolation, restricted keys, secret-scanning recognisability. https://stripe.com/docs/keys
- **Plaid** — three-environment ladder (Sandbox / Development / Production) and the principle of explicit graduation gates. https://plaid.com/docs/api/
- **GitHub** — fine-grained PAT scope catalogue, OAuth Apps for delegated access, GitHub Apps for installable automation. https://docs.github.com/en/authentication
- **AWS IAM** — least-privilege policy model, scoped credentials, STS short-lived tokens. https://docs.aws.amazon.com/IAM/
- **GOV.UK Pay** — government-grade payment APIs, public penetration-test results, prefix-keyed integration. https://docs.payments.service.gov.uk/
- **Estonia X-Road** — PKI mesh between government bodies; mutual TLS at the transport layer; per-MDA certificates. https://x-road.global/
- **OWASP API Security Top 10** — the catalogue of API-specific vulnerabilities this design defends against by construction. https://owasp.org/API-Security/

---

*Companion documents: `PROGRAM_BRIEF.md` (architectural overview), `COMPLIANCE_MATRIX.md` (regulatory mapping), and the live developer-facing security page at `/docs/security`.*
