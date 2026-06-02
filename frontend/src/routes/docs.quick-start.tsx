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
// /docs/quick-start — five steps from zero to a paid cross-MDA assessment.
// Every curl example below runs against the live sandbox at sente-rails.space/v1.

import { createFileRoute } from "@tanstack/react-router";
import { DocPage, H2, H3, P, UL, OL, Code, A } from "@/lib/docs/layout";
import { CodeBlock } from "@/lib/docs/code-block";
import { CodeTabs } from "@/lib/docs/code-tabs";
import { Callout } from "@/lib/docs/callout";

export const Route = createFileRoute("/docs/quick-start")({
  component: QuickStart,
});

function QuickStart() {
  return (
    <DocPage
      eyebrow="Get started"
      title="Quick start"
      description="From the public sandbox to a paid cross-MDA assessment in under ten minutes. Every example below runs against the live rail."
      next={[
        {
          to: "/docs/security",
          label: "Security & compliance",
          description: "Auth, signing, and the regulatory posture behind every call.",
        },
        {
          to: "/docs/cookbook",
          label: "Sandbox cookbook",
          description: "End-to-end recipes for the workflows you'll run most.",
        },
      ]}
    >
      <Callout variant="info" title="Sandbox vs. production">
        <p>
          Every endpoint cited on this page is reachable today at{" "}
          <Code>https://sente-rails.space/v1</Code>. The MoMo adapter runs against
          the MTN Mobile Money sandbox; no real money moves. URA-EFRIS will move
          from <Code>Sandbox</Code> to <Code>Live</Code> the day sandbox credentials
          land — code paths stay identical.
        </p>
      </Callout>

      <H2 id="prereqs">Before you start</H2>
      <P>You need three things:</P>
      <UL>
        <li>
          A terminal with <Code>curl</Code> (every example uses it) and
          optionally <Code>jq</Code> for pretty-printing JSON responses.
        </li>
        <li>
          A sandbox API key. The public catalogue endpoints work without one;
          authenticated calls require a Bearer token. Get one in sixty seconds
          via the self-serve signup at <A to="/signup">/signup</A> — no card
          required, ten thousand calls per month, free forever.
        </li>
        <li>
          About ten minutes. The five steps below take roughly two minutes each.
        </li>
      </UL>

      <H2 id="step-1">1. List the connected agencies</H2>
      <P>
        The catalogue is public — no authentication required. This endpoint
        returns every MDA on the rail with its current integration status,
        sector classification, and live endpoint count.
      </P>
      <CodeBlock
        label="Request"
        language="bash"
        code={`curl https://sente-rails.space/v1/mdas`}
      />
      <CodeBlock
        label="Response (truncated)"
        language="json"
        code={`{
  "data": [
    {
      "short_code": "GULU",
      "full_name": "Gulu City Authority",
      "mda_type": "City Authority",
      "country": "UG",
      "mode": "A",
      "sector": "Local Government",
      "integration_status": "Sandbox",
      "endpoint_count": 6,
      "target_endpoint_count": 14,
      "display_endpoint_count": 6
    },
    {
      "short_code": "URA",
      "full_name": "Uganda Revenue Authority",
      "sector": "Revenue",
      "integration_status": "Sandbox",
      "endpoint_count": 2,
      "display_endpoint_count": 2
    }
  ]
}`}
      />
      <P>
        Filter the catalogue by mode (<Code>A</Code>, <Code>B</Code>, or{" "}
        <Code>C</Code>), sector, or integration status using query parameters
        documented under <A to="/docs/api-standards">API standards</A>.
      </P>

      <H2 id="step-2">2. Authenticate</H2>
      <P>
        Every endpoint outside the public catalogue requires a Bearer token in
        the <Code>X-Sente-Authorization</Code> header. Tokens are scoped per
        integrator and audit-logged on every request.
      </P>
      <Callout variant="info" title="Two accepted Bearer headers">
        <p>
          Both <Code>Authorization: Bearer &lt;key&gt;</Code> and{" "}
          <Code>X-Sente-Authorization: Bearer &lt;key&gt;</Code> are accepted on
          every authenticated endpoint. Use the standard{" "}
          <Code>Authorization</Code> header for compatibility with the bulk of
          client libraries; the custom header is retained for cases where
          another middleware on the network path may strip or rewrite{" "}
          <Code>Authorization</Code>.
        </p>
      </Callout>
      <CodeTabs
        samples={[
          {
            label: "curl",
            code: `curl https://sente-rails.space/v1/citizens \\
  -H "X-Sente-Authorization: Bearer sk_sandbox_xxxxxxxxxxxxxxxx"`,
          },
          {
            label: "Python",
            code: `import os, httpx

client = httpx.Client(
    base_url="https://sente-rails.space/v1",
    headers={"X-Sente-Authorization": f"Bearer {os.environ['SENTE_API_KEY']}"},
    timeout=10.0,
)
r = client.get("/citizens")
r.raise_for_status()`,
          },
          {
            label: "Node",
            code: `const SENTE = "https://sente-rails.space/v1";
const key = process.env.SENTE_API_KEY;

const r = await fetch(\`\${SENTE}/citizens\`, {
  headers: { "X-Sente-Authorization": \`Bearer \${key}\` },
});
if (!r.ok) throw new Error(\`HTTP \${r.status}\`);
const json = await r.json();`,
          },
        ]}
      />
      <Callout variant="warning" title="Keep secrets out of source">
        <p>
          Sandbox keys are still secrets. Treat them like production keys: read
          from an environment variable, never commit to git, and rotate them via
          a sandbox-key rotation if one is exposed.
        </p>
      </Callout>

      <H2 id="step-3">3. Resolve a citizen by NIN</H2>
      <P>
        Citizen lookup is the first leg of almost every counter workflow. The
        rail cascades: local cache first, then NIRA via UGHub if the citizen
        isn&apos;t in the local catalogue yet. The response carries the source
        badge so you can audit where the verification came from.
      </P>
      <CodeBlock
        label="Request"
        language="bash"
        code={`curl https://sente-rails.space/v1/citizens/search-by-nin?nin=CM78001234ABCD \\
  -H "X-Sente-Authorization: Bearer sk_sandbox_xxxxxxxxxxxxxxxx"`}
      />
      <CodeBlock
        label="Response"
        language="json"
        code={`{
  "data": {
    "nin": "CM78001234ABCD",
    "full_name": "John Patrick Mukasa",
    "district": "Gulu",
    "verified": true,
    "source": "local",
    "consent": {
      "data_sharing": true,
      "recorded_on": "2026-05-20T22:57:40Z"
    }
  }
}`}
      />
      <P>
        Fifteen citizens are pre-seeded in the sandbox. See the{" "}
        <A to="/docs/cookbook">cookbook</A> for the full test catalogue and how
        to drive each workflow.
      </P>

      <H2 id="step-4">4. Build a cross-MDA assessment</H2>
      <P>
        An assessment is a basket of one or more lines, each pointing at a
        service on a specific MDA. Cross-MDA in one assessment is a first-class
        behaviour — it compresses a traditional thirty-minute, three-office
        business-registration trail into a single counter interaction.
      </P>
      <CodeBlock
        label="Request"
        language="bash"
        code={`curl -X POST https://sente-rails.space/v1/assessments \\
  -H "X-Sente-Authorization: Bearer sk_sandbox_xxxxxxxxxxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -d '{
    "citizen": "CM78001234ABCD",
    "lines": [
      { "service": "NAME-RESERVE", "mda": "URSB" },
      { "service": "COMPANY-REG",  "mda": "URSB" },
      { "service": "TIN-REG",      "mda": "URA"  },
      { "service": "TL-NEW",       "mda": "GULU" }
    ]
  }'`}
      />
      <CodeBlock
        label="Response"
        language="json"
        code={`{
  "data": {
    "name": "ASSESS-2026-000123",
    "status": "Assessed",
    "cross_mda": true,
    "total_amount": 350000,
    "currency": "UGX",
    "lines": [
      { "service": "NAME-RESERVE", "mda": "URSB", "amount":  50000, "efris_fdn": "FDN-..." },
      { "service": "COMPANY-REG",  "mda": "URSB", "amount": 250000, "efris_fdn": "FDN-..." },
      { "service": "TIN-REG",      "mda": "URA",  "amount":      0, "efris_fdn": null      },
      { "service": "TL-NEW",       "mda": "GULU", "amount":  50000, "efris_fdn": "FDN-..." }
    ]
  }
}`}
      />
      <Callout variant="tip" title="Always send an Idempotency-Key">
        <p>
          Network blips happen at counters. An idempotency key (any UUID) makes
          retrying safe — a second call with the same key returns the original
          assessment, not a duplicate. See{" "}
          <A to="/docs/api-standards">API standards · Idempotency</A> for the
          contract.
        </p>
      </Callout>

      <H2 id="step-5">5. Initiate payment via MoMo sandbox</H2>
      <P>
        A payment intent wraps the assessment, fans out to per-MDA splits at the
        aggregator level, and emits webhooks as the payment progresses. Sente
        Rails never holds the money — settlement lands directly in the
        per-MDA aggregator accounts.
      </P>
      <OL>
        <li>Create the intent against the assessment.</li>
        <li>Initiate the charge via the selected channel (MoMo here).</li>
        <li>Citizen receives a USSD prompt; their PIN confirms the charge.</li>
        <li>The rail receives a webhook and propagates per-MDA receipts.</li>
      </OL>
      <CodeBlock
        label="Step 5a · Create the intent"
        language="bash"
        code={`curl -X POST https://sente-rails.space/v1/payment-intents \\
  -H "X-Sente-Authorization: Bearer sk_sandbox_xxxxxxxxxxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "assessment": "ASSESS-2026-000123",
    "payment_channel": "MTN MoMo"
  }'`}
      />
      <CodeBlock
        label="Step 5b · Initiate the charge"
        language="bash"
        code={`curl -X POST https://sente-rails.space/v1/payment-intents/PI-2026-000045/initiate \\
  -H "X-Sente-Authorization: Bearer sk_sandbox_xxxxxxxxxxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "payer_msisdn": "+256772123456"
  }'`}
      />
      <P>
        On webhook receipt the intent moves to <Code>Confirmed</Code>, the
        per-MDA splits credit their aggregator accounts, and per-MDA receipts
        propagate to URSB, URA, and Gulu City. Inspect the full state machine:
      </P>
      <CodeBlock
        label="Step 5c · Trace"
        language="bash"
        code={`curl https://sente-rails.space/v1/payment-intents/PI-2026-000045/trace \\
  -H "X-Sente-Authorization: Bearer sk_sandbox_xxxxxxxxxxxxxxxx"`}
      />

      <H2 id="next">What to read next</H2>
      <P>
        You&apos;ve seen the spine of the rail. Three threads pull on it:
      </P>
      <UL>
        <li>
          <A to="/docs/webhooks">Webhooks</A> — receive payment, registration,
          and verification events on your side.
        </li>
        <li>
          <A to="/docs/security">Security &amp; compliance</A> — auth modes,
          signing, data classifications, and the seven regulatory frameworks
          mapped to architecture.
        </li>
        <li>
          <A to="/docs/cookbook">Cookbook</A> — four full recipes from everyday
          collections to cross-agency registration, with citizens you can use,
          expected payloads, and timing.
        </li>
      </UL>
    </DocPage>
  );
}
