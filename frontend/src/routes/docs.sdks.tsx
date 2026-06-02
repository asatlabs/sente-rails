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
// /docs/sdks — Postman + multi-language code samples for the most-used endpoints.

import { createFileRoute } from "@tanstack/react-router";
import { DocPage, H2, H3, P, UL, Code, A } from "@/lib/docs/layout";
import { CodeBlock } from "@/lib/docs/code-block";
import { CodeTabs } from "@/lib/docs/code-tabs";
import { Callout } from "@/lib/docs/callout";
import { Download, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/docs/sdks")({
  component: SDKsDoc,
});

function SDKsDoc() {
  return (
    <DocPage
      eyebrow="Reference"
      title="SDKs & samples"
      description="Postman collection, curl snippets, and copy-pastable Python + Node code for the five workflows you will hit ninety percent of the time."
      next={[
        {
          to: "/docs/webhooks",
          label: "Webhooks",
          description: "Receive events from the rail on your side.",
        },
        {
          to: "/docs/cookbook",
          label: "Sandbox cookbook",
          description: "Three end-to-end recipes wired all the way through.",
        },
      ]}
    >
      <H2 id="postman">Postman collection</H2>
      <P>
        The full <Code>/v1</Code> surface — twenty-two endpoints across seven
        modules — ships as a Postman collection in the repository. Import it
        and run the full workflow set end-to-end inside the Postman runner.
      </P>
      <div className="my-4 flex flex-wrap gap-2">
        <a
          href="https://github.com/asatlabs/sente-rails/blob/main/deploy/sente_rails.postman_collection.json"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:border-primary/40"
        >
          <Download className="h-3.5 w-3.5" />
          Download collection
        </a>
        <a
          href="https://github.com/asatlabs/sente-rails/blob/main/deploy/POSTMAN.md"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:border-primary/40"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Postman setup guide
        </a>
      </div>

      <H2 id="sdks">Official SDKs</H2>
      <P>
        Native client libraries are in the planning phase. Today every
        integration uses HTTP directly via curl, your language&apos;s built-in
        HTTP client, or a thin wrapper around it.
      </P>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-surface-muted text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="border-b border-border px-3 py-2 text-left font-semibold">Language</th>
              <th className="border-b border-border px-3 py-2 text-left font-semibold">Today</th>
              <th className="border-b border-border px-3 py-2 text-left font-semibold">Planned</th>
            </tr>
          </thead>
          <tbody className="text-[13px]">
            {[
              ["Python", "httpx + the snippets below", "Q3 2026 — sente-rails python"],
              ["Node / TypeScript", "fetch + the snippets below", "Q3 2026 — @sente-rails/node"],
              ["Java", "OkHttp / java.net.http + snippets", "Q4 2026"],
              [".NET", "HttpClient + snippets", "Q4 2026"],
              ["Go", "net/http + snippets", "Driven by integrator demand"],
              ["PHP", "Guzzle + snippets", "Driven by integrator demand"],
            ].map(([lang, today, planned]) => (
              <tr key={lang} className="border-b border-border last:border-b-0">
                <td className="px-3 py-2 font-medium text-foreground">{lang}</td>
                <td className="px-3 py-2 text-muted-foreground">{today}</td>
                <td className="px-3 py-2 text-muted-foreground">{planned}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Callout variant="info" title="What an SDK will add">
        <p>
          Typed request and response shapes, automatic retry with idempotency
          handling, webhook signature verification helpers, and pagination
          iterators. Until that lands, the snippets below cover the same ground
          with five lines of glue per call.
        </p>
      </Callout>

      <H2 id="catalogue">Catalogue — list agencies</H2>
      <P>
        Public endpoint, no auth. Lists every MDA on the rail with its current
        integration status and live endpoint count.
      </P>
      <CodeTabs
        samples={[
          {
            label: "curl",
            code: `curl https://sente-rails.space/v1/mdas?status=Sandbox`,
          },
          {
            label: "Python",
            code: `import httpx

resp = httpx.get(
    "https://sente-rails.space/v1/mdas",
    params={"status": "Sandbox"},
    timeout=10.0,
)
resp.raise_for_status()
for mda in resp.json()["data"]:
    print(mda["short_code"], "-", mda["sector"])`,
          },
          {
            label: "Node",
            code: `const url = new URL("https://sente-rails.space/v1/mdas");
url.searchParams.set("status", "Sandbox");

const resp = await fetch(url);
if (!resp.ok) throw new Error(\`HTTP \${resp.status}\`);
const { data } = await resp.json();
data.forEach((m) => console.log(m.short_code, "-", m.sector));`,
          },
        ]}
      />

      <H2 id="citizen-lookup">Citizen — resolve by NIN</H2>
      <P>
        Authenticated. Cascades local cache → NIRA via UGHub. Response carries
        the <Code>source</Code> badge so you can audit the verification path.
      </P>
      <CodeTabs
        samples={[
          {
            label: "curl",
            code: `curl https://sente-rails.space/v1/citizens/search-by-nin?nin=CM78001234ABCD \\
  -H "X-Sente-Authorization: Bearer $SENTE_API_KEY"`,
          },
          {
            label: "Python",
            code: `import os, httpx

client = httpx.Client(
    base_url="https://sente-rails.space/v1",
    headers={"X-Sente-Authorization": f"Bearer {os.environ['SENTE_API_KEY']}"},
)
citizen = client.get("/citizens/search-by-nin", params={"nin": "CM78001234ABCD"}).json()["data"]
print(citizen["full_name"], "—", citizen["source"])`,
          },
          {
            label: "Node",
            code: `const key = process.env.SENTE_API_KEY;
const r = await fetch(
  "https://sente-rails.space/v1/citizens/search-by-nin?nin=CM78001234ABCD",
  { headers: { "X-Sente-Authorization": \`Bearer \${key}\` } }
);
const { data } = await r.json();
console.log(data.full_name, "—", data.source);`,
          },
        ]}
      />

      <H2 id="assessment">Assessment — cross-MDA in one call</H2>
      <P>
        Authenticated. Always send an <Code>Idempotency-Key</Code> — see the{" "}
        <A to="/docs/api-standards">API standards page</A> for the contract.
      </P>
      <CodeTabs
        samples={[
          {
            label: "curl",
            code: `curl -X POST https://sente-rails.space/v1/assessments \\
  -H "X-Sente-Authorization: Bearer $SENTE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -d '{
    "citizen": "CM78001234ABCD",
    "lines": [
      { "service": "NAME-RESERVE", "mda": "URSB" },
      { "service": "TIN-REG",      "mda": "URA"  },
      { "service": "TL-NEW",       "mda": "GULU" }
    ]
  }'`,
          },
          {
            label: "Python",
            code: `import os, uuid, httpx

client = httpx.Client(
    base_url="https://sente-rails.space/v1",
    headers={"X-Sente-Authorization": f"Bearer {os.environ['SENTE_API_KEY']}"},
)
body = {
    "citizen": "CM78001234ABCD",
    "lines": [
        {"service": "NAME-RESERVE", "mda": "URSB"},
        {"service": "TIN-REG",      "mda": "URA"},
        {"service": "TL-NEW",       "mda": "GULU"},
    ],
}
resp = client.post(
    "/assessments",
    json=body,
    headers={"Idempotency-Key": str(uuid.uuid4())},
)
resp.raise_for_status()
assessment = resp.json()["data"]
print(assessment["name"], "-", assessment["total_amount"], assessment["currency"])`,
          },
          {
            label: "Node",
            code: `import { randomUUID } from "node:crypto";

const body = {
  citizen: "CM78001234ABCD",
  lines: [
    { service: "NAME-RESERVE", mda: "URSB" },
    { service: "TIN-REG",      mda: "URA"  },
    { service: "TL-NEW",       mda: "GULU" },
  ],
};

const r = await fetch("https://sente-rails.space/v1/assessments", {
  method: "POST",
  headers: {
    "X-Sente-Authorization": \`Bearer \${process.env.SENTE_API_KEY}\`,
    "Content-Type": "application/json",
    "Idempotency-Key": randomUUID(),
  },
  body: JSON.stringify(body),
});
if (!r.ok) throw new Error(await r.text());
const { data: assessment } = await r.json();
console.log(assessment.name, "-", assessment.total_amount, assessment.currency);`,
          },
        ]}
      />

      <H2 id="payment">Payment — initiate via MoMo</H2>
      <P>
        Two-step: create the intent, then initiate the charge. The aggregator
        prompts the citizen on their handset; the rail receives a webhook on
        confirmation and propagates per-MDA receipts.
      </P>
      <CodeBlock
        label="curl (both steps)"
        language="bash"
        code={`# 1) create the intent
INTENT=$(curl -sS -X POST https://sente-rails.space/v1/payment-intents \\
  -H "X-Sente-Authorization: Bearer $SENTE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "assessment": "ASSESS-2026-000123", "payment_channel": "MTN MoMo" }' \\
  | jq -r '.data.name')

# 2) initiate the charge
curl -X POST "https://sente-rails.space/v1/payment-intents/$INTENT/initiate" \\
  -H "X-Sente-Authorization: Bearer $SENTE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "payer_msisdn": "+256772123456" }'

# 3) trace state machine end-to-end (poll or wait for webhook)
curl "https://sente-rails.space/v1/payment-intents/$INTENT/trace" \\
  -H "X-Sente-Authorization: Bearer $SENTE_API_KEY"`}
      />

      <H2 id="webhook">Webhook receiver — verify + acknowledge</H2>
      <P>
        Receive payment + cross-MDA propagation events on your side. Verify the
        HMAC-SHA256 signature against the raw body before parsing. See{" "}
        <A to="/docs/webhooks">Webhooks</A> for the full event catalogue.
      </P>
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

    event = request.json
    # event["type"] e.g. "payment_intent.confirmed", "assessment.propagated"
    # event["data"]["object"] holds the resource snapshot
    print(event["type"], event["id"])
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
  express.raw({ type: "application/json" }), // keep raw body for HMAC
  (req, res) => {
    const sig = req.headers["x-sente-signature"];
    const expected = createHmac("sha256", SECRET).update(req.body).digest("hex");
    const ok =
      typeof sig === "string" &&
      sig.length === expected.length &&
      timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    if (!ok) return res.status(401).end();

    const event = JSON.parse(req.body.toString("utf-8"));
    console.log(event.type, event.id);
    res.status(200).end();
  }
);`,
          },
        ]}
      />
    </DocPage>
  );
}
