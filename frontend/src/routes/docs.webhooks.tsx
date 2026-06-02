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
// /docs/webhooks — outbound events: catalogue, signatures, replay, retries.

import { createFileRoute } from "@tanstack/react-router";
import { DocPage, H2, H3, P, UL, OL, Code, A } from "@/lib/docs/layout";
import { CodeBlock } from "@/lib/docs/code-block";
import { CodeTabs } from "@/lib/docs/code-tabs";
import { Callout } from "@/lib/docs/callout";

export const Route = createFileRoute("/docs/webhooks")({
  component: WebhooksDoc,
});

type EventEntry = {
  type: string;
  desc: string;
  example?: string;
};

const EVENTS: EventEntry[] = [
  {
    type: "assessment.created",
    desc: "A fresh assessment is on the rail — useful for MDAs that want to mirror open obligations.",
  },
  {
    type: "assessment.submitted",
    desc: "Assessment locked. Lines are immutable from this point. EFRIS FDNs attached on each taxable line.",
  },
  {
    type: "assessment.cancelled",
    desc: "Assessor cancelled before payment. No money has moved.",
  },
  {
    type: "payment_intent.initiated",
    desc: "Charge request sent to the aggregator. The citizen's handset is being prompted.",
  },
  {
    type: "payment_intent.confirmed",
    desc: "Aggregator confirmed funds. The split disbursement is in flight.",
  },
  {
    type: "payment_intent.failed",
    desc: "Aggregator returned a terminal failure (cancellation, insufficient balance, etc.).",
  },
  {
    type: "payment_intent.refunded",
    desc: "A refund has been applied. Always traceable back to the original intent + the refunding actor.",
  },
  {
    type: "assessment.propagated",
    desc: "A specific MDA line has been propagated to the destination system of record. Multiple events fire on cross-MDA assessments.",
  },
  {
    type: "shift.opened",
    desc: "A counter shift has opened. Carries the opening float, clerk, and MDA.",
  },
  {
    type: "shift.closed",
    desc: "Counter shift sealed with cash count and variance. Variance audit chain attached.",
  },
  {
    type: "shift.variance_escalated",
    desc: "Supervisor has escalated a variance for Treasurer review.",
  },
  {
    type: "citizen.created",
    desc: "A new citizen record has been written through the rail (rather than mirrored from NIRA).",
  },
  {
    type: "citizen.consent_updated",
    desc: "Citizen consent flags changed. PDP audit-trail tied to a specific actor.",
  },
  {
    type: "catalogue.changed",
    desc: "Service catalogue updated (new service, fee change, retired service). Useful for integrators caching catalogue data.",
  },
];

function WebhooksDoc() {
  return (
    <DocPage
      eyebrow="Reference"
      title="Webhooks"
      description="Outbound events from the rail to your endpoint. Signed with HMAC-SHA256 over the raw body. Idempotent retry semantics. Fourteen event types live today."
      next={[
        {
          to: "/docs/sdks",
          label: "SDKs & samples",
          description: "Verification helpers in Python and Node, ready to copy.",
        },
        {
          to: "/docs/cookbook",
          label: "Sandbox cookbook",
          description: "See webhooks fire through the cookbook recipes.",
        },
      ]}
    >
      <H2 id="overview">Overview</H2>
      <P>
        The rail emits webhooks on every meaningful state change — assessments
        creating, payments confirming, splits propagating, shifts closing. Each
        delivery is signed, idempotent, and retried on transient failures with
        exponential backoff for up to seventy-two hours.
      </P>
      <P>
        Webhooks are configured per integrator via the back-office (today, by
        emailing <A href="mailto:asatlabs@gmail.com">asatlabs@gmail.com</A> while
        self-serve configuration is being wired up). You can register multiple
        endpoints with disjoint event-type filters.
      </P>

      <H2 id="envelope">Event envelope</H2>
      <P>
        Every webhook body shares the same outer shape. The{" "}
        <Code>data.object</Code> field holds the resource snapshot at the
        moment of the event.
      </P>
      <CodeBlock
        label="Webhook body"
        language="json"
        code={`{
  "id": "evt_2026_05_25_a1b2c3d4",
  "type": "payment_intent.confirmed",
  "occurred_at": "2026-05-25T08:30:11Z",
  "api_version": "v1",
  "data": {
    "object": {
      "name": "PI-2026-000045",
      "status": "Confirmed",
      "assessment": "ASSESS-2026-000123",
      "payment_channel": "MTN MoMo",
      "amount": 350000,
      "currency": "UGX",
      "paid_at": "2026-05-25T08:30:09Z"
    }
  }
}`}
      />

      <H2 id="catalogue">Event catalogue</H2>
      <P>Fourteen event types fire today. The catalogue is additive — new types may appear; existing types do not change shape.</P>
      <div className="my-4 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-surface-muted text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="border-b border-border px-3 py-2 text-left font-semibold">Type</th>
              <th className="border-b border-border px-3 py-2 text-left font-semibold">Fires when</th>
            </tr>
          </thead>
          <tbody className="text-[13px]">
            {EVENTS.map((e) => (
              <tr key={e.type} className="border-b border-border last:border-b-0">
                <td className="px-3 py-2 align-top font-mono text-[12px] text-foreground">{e.type}</td>
                <td className="px-3 py-2 text-muted-foreground">{e.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <H2 id="signing">Signature verification</H2>
      <P>
        Every webhook carries an <Code>X-Sente-Signature</Code> header that is
        the HMAC-SHA256 hex digest of the raw request body using the per-
        endpoint signing secret. Verify before parsing the body.
      </P>
      <Callout variant="danger" title="Verify against the raw body, not the parsed JSON">
        <p>
          JSON re-serialisation reorders keys and changes whitespace; the
          signature is computed against the bytes on the wire. If you parse
          first and re-serialise, the digest will mismatch. Buffer the raw body
          before you hand it to your JSON parser.
        </p>
      </Callout>
      <CodeTabs
        samples={[
          {
            label: "Python (Flask)",
            code: `import hmac, hashlib, os
from flask import Flask, request, abort

app = Flask(__name__)
SECRET = os.environ["SENTE_WEBHOOK_SECRET"].encode()

@app.post("/webhooks/sente")
def receive():
    sig = request.headers.get("X-Sente-Signature", "")
    expected = hmac.new(SECRET, request.data, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig):
        abort(401)
    # safe to parse:
    event = request.get_json()
    # ... handle event["type"]
    return "", 200`,
          },
          {
            label: "Node (Express)",
            code: `import express from "express";
import { createHmac, timingSafeEqual } from "node:crypto";

const app = express();
const SECRET = process.env.SENTE_WEBHOOK_SECRET;

app.post(
  "/webhooks/sente",
  express.raw({ type: "application/json" }),  // keep raw body
  (req, res) => {
    const sig = req.headers["x-sente-signature"];
    const expected = createHmac("sha256", SECRET).update(req.body).digest("hex");
    const ok =
      typeof sig === "string" &&
      sig.length === expected.length &&
      timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    if (!ok) return res.status(401).end();

    const event = JSON.parse(req.body.toString("utf-8"));
    // ... handle event.type
    res.status(200).end();
  }
);`,
          },
        ]}
      />

      <H2 id="replay">Replay protection</H2>
      <P>
        Webhook deliveries carry a <Code>X-Sente-Timestamp</Code> header
        (UNIX seconds, sent at delivery time). Reject events whose timestamp
        is more than <strong>five minutes</strong> off your server clock —
        that&apos;s the rail&apos;s replay window. The signature is computed
        before the timestamp so a replayer can&apos;t adjust one without
        invalidating the other.
      </P>
      <CodeBlock
        language="python"
        code={`import time

ts = int(request.headers.get("X-Sente-Timestamp", "0"))
if abs(time.time() - ts) > 300:
    abort(401)  # outside replay window`}
      />

      <H2 id="idempotency">Idempotency on your side</H2>
      <P>
        Treat <Code>event.id</Code> as the dedup key. Persist it on first
        receipt and check on every subsequent delivery — duplicates can and do
        happen, both because of network retries and because of the rail&apos;s
        own at-least-once delivery guarantee.
      </P>
      <UL>
        <li>
          A retry of the same event always carries the same <Code>id</Code>.
        </li>
        <li>
          A genuinely new state change carries a fresh <Code>id</Code>, even
          when it&apos;s about the same resource (e.g. a payment that fails,
          then re-tries, then succeeds — three events, three IDs).
        </li>
        <li>
          Acknowledge with HTTP <Code>200</Code> within thirty seconds. Any
          other status is treated as a transient failure and triggers retry.
        </li>
      </UL>

      <H2 id="retry">Retry semantics</H2>
      <P>
        If your endpoint responds with anything other than <Code>2xx</Code>{" "}
        within thirty seconds, the rail retries with exponential backoff:
      </P>
      <OL>
        <li>+30 seconds</li>
        <li>+2 minutes</li>
        <li>+15 minutes</li>
        <li>+1 hour</li>
        <li>+4 hours</li>
        <li>+12 hours, repeating up to 72 hours total</li>
      </OL>
      <P>
        After the 72-hour window the event is moved to a dead-letter queue
        and surfaced on the back-office for manual review. The audit log
        retains the full delivery history for any event.
      </P>

      <H2 id="local-dev">Local development</H2>
      <P>
        Sandbox webhooks need a publicly-reachable URL. Three common patterns
        during local development:
      </P>
      <UL>
        <li>
          <strong>ngrok / cloudflared tunnel.</strong> Free tier covers the
          sandbox traffic volume. Register the tunnel URL as the endpoint and
          tear it down when you&apos;re done.
        </li>
        <li>
          <strong>Webhook inspector services.</strong> webhook.site is fine for
          visual inspection; copy the signature header and the raw body to
          verify manually.
        </li>
        <li>
          <strong>Trigger replay from the back-office.</strong> Every event in
          the audit log can be re-fired against the registered endpoint with
          one click — useful for repeatedly testing your handler.
        </li>
      </UL>

      <H2 id="sample">Sample payloads</H2>
      <CodeBlock
        label="payment_intent.confirmed"
        language="json"
        code={`{
  "id": "evt_2026_05_25_a1b2c3d4",
  "type": "payment_intent.confirmed",
  "occurred_at": "2026-05-25T08:30:11Z",
  "api_version": "v1",
  "data": {
    "object": {
      "name": "PI-2026-000045",
      "assessment": "ASSESS-2026-000123",
      "status": "Confirmed",
      "amount": 350000,
      "currency": "UGX",
      "payment_channel": "MTN MoMo",
      "aggregator_reference": "MOMO-2026-XYZ",
      "paid_at": "2026-05-25T08:30:09Z",
      "splits": [
        { "mda": "URSB", "amount": 300000 },
        { "mda": "URA",  "amount":      0 },
        { "mda": "GULU", "amount":  50000 }
      ]
    }
  }
}`}
      />
      <CodeBlock
        label="assessment.propagated (one per MDA on cross-MDA)"
        language="json"
        code={`{
  "id": "evt_2026_05_25_e5f6g7h8",
  "type": "assessment.propagated",
  "occurred_at": "2026-05-25T08:30:14Z",
  "api_version": "v1",
  "data": {
    "object": {
      "assessment": "ASSESS-2026-000123",
      "mda": "URSB",
      "lines": [
        { "service": "NAME-RESERVE", "fdn": "FDN-2026-N1", "amount":  50000 },
        { "service": "COMPANY-REG",  "fdn": "FDN-2026-C1", "amount": 250000 }
      ],
      "destination_reference": "URSB-CERT-2026-7891"
    }
  }
}`}
      />
    </DocPage>
  );
}
