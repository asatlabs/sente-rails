// ─────────────────────────────────────────────────────────────────────────────
// Copyright (c) 2026 Geoffrey Oketwangwu (asatlabs.org)
// Author:  Geoffrey Oketwangwu <geoffreyoketwangwu@gmail.com>
//
// CONFIDENTIAL AND PROPRIETARY
//
// This source file is the original work of Geoffrey Oketwangwu and contains
// confidential, proprietary information protected under copyright and trade-
// secret law. No part may be reproduced, distributed, modified, reverse-
// engineered, or used — in source or compiled form — without the prior
// written permission of the author.
//
// All rights reserved.
// /docs/security — security architecture + regulatory posture.
// Maps the seven Ugandan frameworks the rail addresses, plus auth/signing details.

import { createFileRoute } from "@tanstack/react-router";
import { DocPage, H2, H3, P, UL, Code, A } from "@/lib/docs/layout";
import { CodeBlock } from "@/lib/docs/code-block";
import { Callout } from "@/lib/docs/callout";

export const Route = createFileRoute("/docs/security")({
  component: SecurityDoc,
});

const FRAMEWORKS: { name: string; section?: string; posture: string; evidence: string }[] = [
  {
    name: "Personal Data and Privacy Act",
    section: "2019",
    posture:
      "Consent metadata is captured on every Citizen record. National Identification Numbers never appear in URLs or document names. Right-to-erasure is honoured via soft-archive (status flip + audit trail) so referential integrity on paid receipts stays intact.",
    evidence: "Citizen consent model · /v1/citizens",
  },
  {
    name: "Tax Procedures Code Act",
    section: "2014 §73A–73B",
    posture:
      "Every service flagged as EFRIS-taxable routes through the EFRIS fiscal adapter at assessment time. Each assessment line carries a per-line Fiscal Document Number. The full fiscal round-trip — generate PRN, post invoice, retrieve FDN — runs live end-to-end in the sandbox.",
    evidence: "sente_rails/adapters/fiscal/uganda_efris.py · /v1/integrations",
  },
  {
    name: "Public Finance Management Act",
    section: "2015 §43",
    posture:
      "The rail never holds public money. Citizen payments flow directly from the citizen's wallet to a licensed aggregator on a per-MDA payable account. Cross-MDA assessments split at the aggregator, never at Sente Rails. There is no single rail wallet that accumulates revenue.",
    evidence: "Receivable-only ledger · payment split at the aggregator",
  },
  {
    name: "e-Government Interoperability Framework",
    posture:
      "API-first by construction. The complete /v1 surface is REST/JSON, documented in OpenAPI 3.1. The UGHub gateway adapter is scaffolded for the standard NITA-U integration path.",
    evidence: "/docs/explorer · adapters/gateway/uganda_ughub.py",
  },
  {
    name: "Access to Information Act",
    section: "2005",
    posture:
      "Oversight bodies (OAG, MoFPED, UBOS, MoLG) operate as Mode C Read Consumers — scoped reads only, never collect on behalf of any MDA. Aggregate statistics are open by default; itemised reads require role-scoped credentials with full audit logging.",
    evidence: "Role-scoped oversight reads · /agencies",
  },
  {
    name: "Computer Misuse Act",
    section: "2011, amended 2022",
    posture:
      "Authentication logs are immutable. Rate limiting at the nginx edge plus per-endpoint application throttling. The administrative back-end is not exposed publicly — it returns 404 at the edge, so there is no public administrative surface. Intrusion detection and penetration testing are sequenced for pre-production hardening.",
    evidence: "sente_rails/auth.py · edge-level admin block · immutable audit log",
  },
  {
    name: "National Payment Systems Act",
    section: "2020",
    posture:
      "All payment processing is mediated by licensed aggregators — MTN MoMo (sandbox live), Airtel Money (sandbox pending), Pesapal (planned). Card and bank settlement routes are scaffolded for production. Sente Rails never registers as a PSP; by architectural posture it does not need to.",
    evidence: "sente_rails/adapters/payment/*.py · aggregator-mediated",
  },
];

function SecurityDoc() {
  return (
    <DocPage
      eyebrow="Concepts"
      title="Security & compliance"
      description="Authentication modes, signing requirements, data-classification model, and the seven Ugandan regulatory frameworks the architecture addresses by design — not by retrofit."
      next={[
        {
          to: "/docs/api-standards",
          label: "API standards",
          description: "The contract every endpoint honours — versioning, errors, pagination.",
        },
        {
          to: "/docs/webhooks",
          label: "Webhooks",
          description: "Signature verification and replay protection on inbound events.",
        },
      ]}
    >
      <H2 id="auth">Authentication</H2>
      <P>
        Every endpoint outside the public catalogue requires a Bearer token.
        Tokens are scoped per integrator, carry a documented set of
        permissions, and are revocable at any time without affecting other
        clients. Both <Code>Authorization: Bearer &lt;key&gt;</Code> and{" "}
        <Code>X-Sente-Authorization: Bearer &lt;key&gt;</Code> are accepted on
        every authenticated endpoint — use the standard{" "}
        <Code>Authorization</Code> header for compatibility with the bulk of
        client libraries; the custom header is retained for cases where another
        middleware on the network path may strip or rewrite{" "}
        <Code>Authorization</Code>.
      </P>
      <H3 id="bearer">Bearer tokens</H3>
      <P>
        Default for server-to-server integrations. The token is opaque, ~40
        characters, prefixed with <Code>sk_sandbox_</Code> in sandbox or{" "}
        <Code>sk_live_</Code> in production. Send it on every request:
      </P>
      <CodeBlock
        language="http"
        code={`GET /v1/citizens HTTP/1.1
Host: sente-rails.space
X-Sente-Authorization: Bearer sk_sandbox_xxxxxxxxxxxxxxxx`}
      />
      <H3 id="oauth">OAuth 2.0 client_credentials</H3>
      <P>
        For partner platforms (a city ERP, an enterprise integrator) the
        rail issues OAuth 2.0 <Code>client_credentials</Code> tokens with
        configurable scopes — for example <Code>citizens.read</Code>,{" "}
        <Code>assessments.write</Code>, <Code>oversight.read</Code>. The flow
        follows RFC 6749 §4.4 with no client-side deviations; any standard
        OAuth library works without modification.
      </P>
      <H3 id="mtls">mTLS for high-risk endpoints</H3>
      <P>
        Payment confirmation webhooks, oversight read endpoints under the OAG
        scope, and credential rotation are gated behind mutual TLS in addition
        to the Bearer token. The rail pins the client certificate against a
        registered per-integrator fingerprint set.
      </P>

      <H2 id="signing">Request signing</H2>
      <P>
        Inbound webhooks from aggregators (MoMo, Airtel) and EFRIS-side
        callbacks are signed with HMAC-SHA256 over the raw request body using a
        shared secret. Verify before parsing:
      </P>
      <CodeBlock
        label="Webhook signature verification"
        language="python"
        code={`import hmac, hashlib

def verify(secret: str, body: bytes, signature_header: str) -> bool:
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    # Constant-time compare against the value carried in X-Sente-Signature
    return hmac.compare_digest(expected, signature_header)`}
      />
      <Callout variant="warning" title="Always verify against the raw body">
        <p>
          JSON re-serialisation reorders keys and changes whitespace; the
          signature is computed against the bytes on the wire. Verify before
          you parse, or buffer the raw body separately from your parser.
        </p>
      </Callout>

      <H2 id="data">Data classification</H2>
      <P>
        Three tiers govern how the rail handles each data class. Higher tiers
        carry stricter logging, retention, and access controls.
      </P>
      <UL>
        <li>
          <strong>Tier 1 — Personal.</strong> National Identification Numbers,
          phone numbers, addresses, consent metadata. Never appears in URLs or
          log lines; only in indexed body fields with role-gated read. Soft-
          archive on erasure request preserves referential integrity for paid
          receipts under PFMA retention rules.
        </li>
        <li>
          <strong>Tier 2 — Financial.</strong> Payment Intent references,
          aggregator transaction IDs, FDN values, assessment totals. Audit-
          logged on every read and write. Aggregator-side balances are never
          persisted by the rail.
        </li>
        <li>
          <strong>Tier 3 — Operational.</strong> MDA catalogue, service
          catalogue, public statistics, integration status. Catalogue endpoints
          are public-read; statistics aggregate only.
        </li>
      </UL>

      <H2 id="frameworks">Regulatory frameworks</H2>
      <P>
        Seven Ugandan regulatory frameworks fall within scope. Each is
        addressed by design — the architecture does the regulatory work, not a
        retrofitted policy layer.
      </P>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-surface-muted text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="border-b border-border px-3 py-2 text-left font-semibold">Framework</th>
              <th className="border-b border-border px-3 py-2 text-left font-semibold">Architectural posture</th>
              <th className="hidden border-b border-border px-3 py-2 text-left font-semibold lg:table-cell">
                Evidence
              </th>
            </tr>
          </thead>
          <tbody>
            {FRAMEWORKS.map((f) => (
              <tr key={f.name} className="border-b border-border align-top last:border-b-0">
                <td className="px-3 py-3">
                  <p className="font-medium text-foreground">{f.name}</p>
                  {f.section && (
                    <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{f.section}</p>
                  )}
                </td>
                <td className="px-3 py-3 text-[13px] text-muted-foreground">{f.posture}</td>
                <td className="hidden px-3 py-3 font-mono text-[11px] text-muted-foreground lg:table-cell">
                  {f.evidence}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <H2 id="audit">Audit trail</H2>
      <P>
        Every state-changing operation is captured in an immutable audit log:
        actor, timestamp, target document, before / after payload. Oversight
        Mode C consumers read against this log scoped to their statutory remit.
      </P>
      <CodeBlock
        label="Audit log entry (shape)"
        language="json"
        code={`{
  "doctype": "Assessment",
  "name": "ASSESS-2026-000123",
  "action": "submit",
  "actor": { "user": "clerk@gulu.gov.ug", "role": "Sente Rails Clerk" },
  "context": { "shift": "SHIFT-2026-000045", "mda": "GULU", "ip": "10.x.x.x" },
  "before": null,
  "after": { "status": "Assessed", "total_amount": 50000 },
  "occurred_at": "2026-05-25T08:30:11Z"
}`}
      />

      <H2 id="hardening">Production hardening</H2>
      <P>
        Two items remain queued for the pre-production pass before any live
        traffic moves through the rail:
      </P>
      <UL>
        <li>
          <strong>Intrusion detection.</strong> Edge-side request anomaly
          scoring with per-integrator baselines. Slated for the production
          hardening pass.
        </li>
        <li>
          <strong>Formal penetration test.</strong> Independent third-party
          test against the live URL, results published as an appendix to this
          documentation under <A to="/docs/explorer">the API explorer</A>.
        </li>
      </UL>
      <Callout variant="info" title="Source of truth">
        <p>
          The standalone compliance matrix — the same content as the table
          above, on one page — lives in the repository at{" "}
          <Code>docs/COMPLIANCE_MATRIX.md</Code>. Every row above quotes it.
        </p>
      </Callout>
    </DocPage>
  );
}
