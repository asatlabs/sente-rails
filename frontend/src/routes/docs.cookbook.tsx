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
// /docs/cookbook — end-to-end recipes for the workflows operators and integrators hit most.
// Each is runnable against the live sandbox at sente-rails.space/v1.

import { createFileRoute } from "@tanstack/react-router";
import { DocPage, H2, H3, P, UL, OL, Code, A } from "@/lib/docs/layout";
import { CodeBlock } from "@/lib/docs/code-block";
import { Callout } from "@/lib/docs/callout";

export const Route = createFileRoute("/docs/cookbook")({
  component: CookbookDoc,
});

function CookbookDoc() {
  return (
    <DocPage
      eyebrow="Reference"
      title="Cookbook"
      description="End-to-end recipes for the workflows you'll run most — from an everyday market-dues collection to a full cross-agency business registration. Every step is runnable against the live sandbox; citizens, mobile-money numbers, and expected payloads are wired up."
    >
      <Callout variant="tip" title="How to use these recipes">
        <p>
          Each recipe is a complete, copy-pastable workflow against{" "}
          <Code>sente-rails.space/v1</Code>. Paste the curl commands in order
          and you&apos;ll drive the same state machines a counter clerk or an
          integrator app drives in production. They ramp in complexity —
          start with Recipe 1 and work down.
        </p>
      </Callout>

      <H2 id="test-data">Test data reference</H2>
      <P>
        The sandbox is pre-seeded with forty-six agencies across twenty-six
        sectors, their service catalogues and fee schedules, and a set of
        citizens you can transact against. The three below appear throughout
        the recipes here.
      </P>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-surface-muted text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="border-b border-border px-3 py-2 text-left font-semibold">Persona</th>
              <th className="border-b border-border px-3 py-2 text-left font-semibold">NIN</th>
              <th className="border-b border-border px-3 py-2 text-left font-semibold">District</th>
              <th className="border-b border-border px-3 py-2 text-left font-semibold">Use for</th>
            </tr>
          </thead>
          <tbody className="text-[13px]">
            <tr className="border-b border-border">
              <td className="px-3 py-2 font-medium text-foreground">John Patrick Mukasa</td>
              <td className="px-3 py-2 font-mono text-[12px]">CM78001234ABCD</td>
              <td className="px-3 py-2 text-muted-foreground">Gulu</td>
              <td className="px-3 py-2 text-muted-foreground">Counter-led collection & registration</td>
            </tr>
            <tr className="border-b border-border">
              <td className="px-3 py-2 font-medium text-foreground">Patrick Okello Akena</td>
              <td className="px-3 py-2 font-mono text-[12px]">CM85042134GULU</td>
              <td className="px-3 py-2 text-muted-foreground">Gulu</td>
              <td className="px-3 py-2 text-muted-foreground">Cross-agency Lands scenarios</td>
            </tr>
            <tr>
              <td className="px-3 py-2 font-medium text-foreground">Robert Ssemakula Mukasa</td>
              <td className="px-3 py-2 font-mono text-[12px]">CM81051712KLAA</td>
              <td className="px-3 py-2 text-muted-foreground">Kampala</td>
              <td className="px-3 py-2 text-muted-foreground">Kampala-side Mode B scenarios</td>
            </tr>
          </tbody>
        </table>
      </div>
      <P>
        MoMo sandbox MSISDN: <Code>+256772123456</Code>. Any string ending
        with <Code>123456</Code> will resolve in the MTN sandbox. Other
        aggregator numbers are documented inside the Postman collection.
      </P>

      <H2 id="recipe-1">Recipe 1 — Everyday market-dues collection</H2>
      <P>
        The rail&apos;s highest-volume, most everyday transaction: a vegetable
        seller at Cereleno Market in Gulu pays her daily market dues — a small,
        fixed statutory fee — and a clerk rings it up in seconds. This is the
        bread-and-butter of local-government revenue, repeated thousands of
        times a day across the country. We use the pre-seeded Gulu citizen
        (<Code>CM78001234ABCD</Code>).
      </P>

      <H3 id="m1">1. Open the counter shift</H3>
      <P>
        The clerk opens their till for the day with the cash already in the
        drawer (the opening float).
      </P>
      <CodeBlock
        language="bash"
        code={`curl -X POST https://sente-rails.space/v1/counter-shifts/open \\
  -H "X-Sente-Authorization: Bearer $SENTE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "mda": "GULU", "opening_float": 100000 }'`}
      />

      <H3 id="m2">2. Resolve the citizen</H3>
      <CodeBlock
        language="bash"
        code={`curl https://sente-rails.space/v1/citizens/search-by-nin?nin=CM78001234ABCD \\
  -H "X-Sente-Authorization: Bearer $SENTE_API_KEY"`}
      />

      <H3 id="m3">3. Assess the daily dues</H3>
      <P>
        One line, the daily vegetables-market fee. The price is set by the
        agency — the server fetches it from the service&apos;s fee schedule, so
        the amount can never be entered or undercut by the caller.
      </P>
      <CodeBlock
        language="bash"
        code={`curl -X POST https://sente-rails.space/v1/assessments \\
  -H "X-Sente-Authorization: Bearer $SENTE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -d '{
    "citizen": "CM78001234ABCD",
    "lines": [{ "service": "MD-VEGETABLES", "mda": "GULU" }]
  }'`}
      />
      <P>
        Assessment returns <Code>Assessed</Code> with a total of{" "}
        <Code>1500 UGX</Code> — the statutory daily fee.
      </P>

      <H3 id="m4">4. Take the payment</H3>
      <P>
        At a market counter this is usually paid in cash (channel{" "}
        <Code>Cash</Code>); here we use the MoMo sandbox so the whole recipe
        runs end-to-end. The flow is identical either way.
      </P>
      <CodeBlock
        language="bash"
        code={`INTENT=$(curl -sS -X POST https://sente-rails.space/v1/payment-intents \\
  -H "X-Sente-Authorization: Bearer $SENTE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "assessment": "ASSESS-2026-000200", "payment_channel": "MTN MoMo" }' \\
  | jq -r '.data.name')

curl -X POST "https://sente-rails.space/v1/payment-intents/$INTENT/initiate" \\
  -H "X-Sente-Authorization: Bearer $SENTE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "payer_msisdn": "+256772123456" }'`}
      />
      <P>
        On confirmation the dues are recorded against the seller, the funds are
        routed to Gulu&apos;s collection account, and the amount lands in the
        clerk&apos;s shift totals for end-of-day reconciliation. A 1,500-shilling
        market payment is now as traceable and verifiable as a bank transfer.
      </P>

      <H2 id="recipe-2">Recipe 2 — Counter-led trading licence renewal</H2>
      <P>
        A clerk at Gulu City Hall renews John Mukasa&apos;s trading licence
        end-to-end: NIN cascade, single-line assessment with an EFRIS fiscal
        document number (FDN), MoMo payment, and a receipt with a QR code that
        points at the public verifier. A routine licensing interaction, start
        to finish.
      </P>
      <img
        src="/wb-assets/cookbook-vertical-1.svg"
        alt="Sequence diagram for the trading licence renewal recipe"
        className="my-4 hidden"
      />
      <P>
        <em>
          Sequence diagram available in the repository at{" "}
          <Code>docs/diagrams/04-workflow-vertical-1-trading-licence.svg</Code>.
        </em>
      </P>

      <H3 id="r1-1">1. Open the counter shift</H3>
      <CodeBlock
        language="bash"
        code={`curl -X POST https://sente-rails.space/v1/counter-shifts/open \\
  -H "X-Sente-Authorization: Bearer $SENTE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "mda": "GULU", "opening_float": 100000 }'`}
      />

      <H3 id="r1-2">2. Resolve the citizen</H3>
      <CodeBlock
        language="bash"
        code={`curl https://sente-rails.space/v1/citizens/search-by-nin?nin=CM78001234ABCD \\
  -H "X-Sente-Authorization: Bearer $SENTE_API_KEY"`}
      />

      <H3 id="r1-3">3. Create the single-line assessment</H3>
      <CodeBlock
        language="bash"
        code={`curl -X POST https://sente-rails.space/v1/assessments \\
  -H "X-Sente-Authorization: Bearer $SENTE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -d '{
    "citizen": "CM78001234ABCD",
    "lines": [{ "service": "TL-RENEW", "mda": "GULU" }]
  }'`}
      />
      <P>
        Assessment status returns <Code>Assessed</Code> with a single FDN
        attached to the <Code>TL-RENEW</Code> line and total{" "}
        <Code>50000 UGX</Code>.
      </P>

      <H3 id="r1-4">4. Initiate the MoMo charge</H3>
      <CodeBlock
        language="bash"
        code={`# create the intent
INTENT=$(curl -sS -X POST https://sente-rails.space/v1/payment-intents \\
  -H "X-Sente-Authorization: Bearer $SENTE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "assessment": "ASSESS-2026-000123", "payment_channel": "MTN MoMo" }' \\
  | jq -r '.data.name')

# charge
curl -X POST "https://sente-rails.space/v1/payment-intents/$INTENT/initiate" \\
  -H "X-Sente-Authorization: Bearer $SENTE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "payer_msisdn": "+256772123456" }'`}
      />

      <H3 id="r1-5">5. Watch the trace</H3>
      <P>
        Either poll <Code>/trace</Code> or subscribe to the{" "}
        <Code>payment_intent.confirmed</Code> webhook (see{" "}
        <A to="/docs/webhooks">Webhooks</A>). On confirmation the trace
        carries the full state machine: initiated → confirmed → settled →
        propagated.
      </P>

      <H3 id="r1-6">6. Verify the receipt as a citizen would</H3>
      <P>
        The printed receipt embeds a QR pointing at the public verifier.
        The citizen-facing summary at <Code>/verify/&lt;payment-ref&gt;</Code>{" "}
        is PII-safe and unauthenticated — anyone with the QR can confirm the
        payment is real:
      </P>
      <CodeBlock
        language="bash"
        code={`curl https://sente-rails.space/v1/payment-intents/PI-2026-000045/public-summary`}
      />

      <H2 id="recipe-3">Recipe 3 — Lands title transfer with EFRIS PRN</H2>
      <P>
        An API-led, cross-agency transaction handled entirely via{" "}
        <Code>/v1</Code>: two agencies in one assessment (Ministry of Lands
        title transfer and URA stamp duty), an EFRIS payment-registration
        number (PRN) generated per taxable line, a single unified MoMo charge,
        aggregator-level split disbursement to both agencies, and a
        side-by-side reconciliation against MTN&apos;s own API.
      </P>
      <P>
        <em>
          Sequence diagram in the repository at{" "}
          <Code>docs/diagrams/05-workflow-vertical-2-lands-title.svg</Code>.
        </em>
      </P>

      <H3 id="r2-1">1. Build the two-line cross-agency assessment</H3>
      <CodeBlock
        language="bash"
        code={`curl -X POST https://sente-rails.space/v1/assessments \\
  -H "X-Sente-Authorization: Bearer $SENTE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -d '{
    "citizen": "CM85042134GULU",
    "lines": [
      { "service": "TITLE-TRANSFER", "mda": "MOL" },
      { "service": "STAMP-DUTY",     "mda": "URA" }
    ]
  }'`}
      />
      <P>
        Response carries <Code>cross_mda: true</Code>, two FDNs (one per
        EFRIS-taxable line), and a total of <Code>90000 UGX</Code>.
      </P>

      <H3 id="r2-2">2. Initiate unified payment via MoMo</H3>
      <P>
        One MoMo charge for the whole 90,000. The split disbursement happens
        on the aggregator side after confirmation — Sente Rails never holds
        the money in between.
      </P>
      <CodeBlock
        language="bash"
        code={`INTENT=$(curl -sS -X POST https://sente-rails.space/v1/payment-intents \\
  -H "X-Sente-Authorization: Bearer $SENTE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "assessment": "ASSESS-2026-000124", "payment_channel": "MTN MoMo" }' \\
  | jq -r '.data.name')

curl -X POST "https://sente-rails.space/v1/payment-intents/$INTENT/initiate" \\
  -H "X-Sente-Authorization: Bearer $SENTE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "payer_msisdn": "+256772123456" }'`}
      />

      <H3 id="r2-3">3. Side-by-side reconciliation</H3>
      <P>
        The <Code>/live-status</Code> endpoint queries the aggregator directly
        and returns both records side by side — the &quot;our records match the
        aggregator&apos;s records&quot; reconciliation proof, on demand:
      </P>
      <CodeBlock
        language="bash"
        code={`curl "https://sente-rails.space/v1/payment-intents/$INTENT/live-status" \\
  -H "X-Sente-Authorization: Bearer $SENTE_API_KEY"`}
      />
      <CodeBlock
        label="Response shape"
        language="json"
        code={`{
  "data": {
    "rail": {
      "status": "Confirmed",
      "aggregator_reference": "MOMO-SBX-2026-7891",
      "paid_at": "2026-05-25T08:30:09Z"
    },
    "aggregator": {
      "status": "SUCCESSFUL",
      "transaction_id": "MOMO-SBX-2026-7891",
      "amount": 90000,
      "currency": "UGX"
    },
    "match": true
  }
}`}
      />

      <H2 id="recipe-4">Recipe 4 — Cross-agency business registration</H2>
      <P>
        The rail&apos;s most ambitious flow: three agencies touched in a single
        transaction — URSB (name reservation + company registration), URA (TIN
        issuance), and Gulu City (new trading licence). Parallel propagation
        means all three artefacts are issued concurrently on payment
        confirmation, collapsing a multi-office errand into one interaction.
      </P>
      <P>
        <em>
          Sequence diagram in the repository at{" "}
          <Code>docs/diagrams/06-workflow-vertical-3-cross-mda.svg</Code>.
        </em>
      </P>

      <H3 id="r3-1">1. Resolve the prospective director</H3>
      <CodeBlock
        language="bash"
        code={`curl https://sente-rails.space/v1/citizens/search-by-nin?nin=CM78001234ABCD \\
  -H "X-Sente-Authorization: Bearer $SENTE_API_KEY"`}
      />

      <H3 id="r3-2">2. Build the four-line assessment across three agencies</H3>
      <CodeBlock
        language="bash"
        code={`curl -X POST https://sente-rails.space/v1/assessments \\
  -H "X-Sente-Authorization: Bearer $SENTE_API_KEY" \\
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
      <P>
        Total <Code>350000 UGX</Code>. Three FDNs attached (TIN-REG is
        UGX 0, no FDN). Response includes <Code>cross_mda: true</Code> and{" "}
        <Code>mdas_count: 3</Code>.
      </P>

      <H3 id="r3-3">3. Single MoMo charge, three propagation webhooks</H3>
      <CodeBlock
        language="bash"
        code={`INTENT=$(curl -sS -X POST https://sente-rails.space/v1/payment-intents \\
  -H "X-Sente-Authorization: Bearer $SENTE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "assessment": "ASSESS-2026-000125", "payment_channel": "MTN MoMo" }' \\
  | jq -r '.data.name')

curl -X POST "https://sente-rails.space/v1/payment-intents/$INTENT/initiate" \\
  -H "X-Sente-Authorization: Bearer $SENTE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "payer_msisdn": "+256772123456" }'`}
      />
      <P>
        On confirmation: one <Code>payment_intent.confirmed</Code> webhook,
        three <Code>assessment.propagated</Code> webhooks (one per agency), and
        the rail&apos;s ledger reflects URSB ← 300k / URA ← 0 / Gulu ← 50k
        at the aggregator level.
      </P>

      <H3 id="r3-4">4. The headline outcome</H3>
      <P>
        From a cold start (no prior citizen lookup) this recipe completes in
        roughly ninety seconds against the sandbox — under thirty minutes from
        idea to a formalised business once you allow for the human steps in
        between. What used to be days of queuing is now a single counter
        interaction: same legal artefacts, same statutory fees, a fraction of
        the operational distance.
      </P>
      <Callout variant="info" title="What this replaces">
        <p>
          The traditional path for a Ugandan business registration: three
          separate government offices, three separate queues, three separate
          payment windows, paper-based handoffs between offices, and a typical
          multi-day turnaround. This recipe collapses it to a single counter
          interaction — same legal artefacts, same statutory fees, dramatically
          shorter operational distance.
        </p>
      </Callout>
    </DocPage>
  );
}
