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
// /docs/api-standards — the contract every endpoint honours.
// Versioning, error envelope, pagination, idempotency, rate limits, dates/currency.

import { createFileRoute } from "@tanstack/react-router";
import { DocPage, H2, H3, P, UL, Code, A } from "@/lib/docs/layout";
import { CodeBlock } from "@/lib/docs/code-block";
import { Callout } from "@/lib/docs/callout";

export const Route = createFileRoute("/docs/api-standards")({
  component: ApiStandards,
});

function ApiStandards() {
  return (
    <DocPage
      eyebrow="Concepts"
      title="API standards"
      description="The contract every endpoint on the rail honours. Read once, never wonder again why a response looks the way it does."
      next={[
        {
          to: "/docs/sdks",
          label: "SDKs & samples",
          description: "Postman, curl, Python and Node examples for every endpoint.",
        },
        {
          to: "/docs/webhooks",
          label: "Webhooks",
          description: "Outbound events: catalogue, signatures, replay.",
        },
      ]}
    >
      <H2 id="versioning">Versioning</H2>
      <P>
        The API surface is versioned in the URL path —{" "}
        <Code>/v1/&lt;resource&gt;</Code>. The version moves when an
        incompatible change ships; additive changes (new optional fields, new
        endpoints, new query parameters) stay on the current major.
      </P>
      <UL>
        <li>
          <strong>Stable contract on v1.</strong> Existing clients keep working
          until a stated deprecation window closes — minimum twelve months
          notice from the day the deprecation page goes up.
        </li>
        <li>
          <strong>Beta endpoints.</strong> Marked with the{" "}
          <Code>X-Sente-Stage: beta</Code> response header. Field shapes may
          change without notice while in beta; the URL stays the same when the
          endpoint stabilises.
        </li>
        <li>
          <strong>Vendor extensions.</strong> Custom fields are namespaced
          under <Code>x_</Code> (for example <Code>x_gulu_zone_id</Code>) so
          they never collide with future core additions.
        </li>
      </UL>

      <H2 id="envelope">Response envelope</H2>
      <P>
        Every successful response wraps its payload in a{" "}
        <Code>data</Code> field. Lists carry pagination metadata in a sibling{" "}
        <Code>pagination</Code> object. Errors use a distinct envelope with a{" "}
        <Code>error</Code> field — never both.
      </P>
      <CodeBlock
        label="Single-resource success"
        language="json"
        code={`{
  "data": {
    "name": "ASSESS-2026-000123",
    "status": "Assessed",
    "total_amount": 50000,
    "currency": "UGX"
  }
}`}
      />
      <CodeBlock
        label="List success"
        language="json"
        code={`{
  "data": [
    { "short_code": "GULU", "sector": "Local Government" },
    { "short_code": "URA",  "sector": "Revenue" }
  ],
  "pagination": {
    "limit": 100,
    "start": 0,
    "total": 46,
    "has_more": false
  }
}`}
      />

      <H2 id="errors">Error envelope</H2>
      <P>
        All errors share a stable shape. Match on <Code>error.code</Code>{" "}
        (machine-readable, stable across releases), not on the message string
        (human-readable, may evolve).
      </P>
      <CodeBlock
        label="Error response"
        language="json"
        code={`{
  "error": {
    "code": "validation_failed",
    "message": "Assessment Line for service TL-RENEW is missing required field 'mda'.",
    "request_id": "req_2026_05_25_abc123",
    "details": [
      { "field": "lines[0].mda", "issue": "required" }
    ]
  }
}`}
      />
      <P>The canonical <Code>error.code</Code> values:</P>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-surface-muted text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="border-b border-border px-3 py-2 text-left font-semibold">Code</th>
              <th className="border-b border-border px-3 py-2 text-left font-semibold">HTTP</th>
              <th className="border-b border-border px-3 py-2 text-left font-semibold">Meaning</th>
            </tr>
          </thead>
          <tbody className="text-[13px]">
            {[
              ["validation_failed", "400", "Request body or query parameters didn't pass schema validation."],
              ["unauthorized", "401", "Missing or invalid Bearer token."],
              ["forbidden", "403", "Token valid but insufficient scope for this resource."],
              ["not_found", "404", "Resource doesn't exist on this site."],
              ["conflict", "409", "Idempotency-Key collision with a different request body, or state conflict (e.g. assessing a submitted doc)."],
              ["unprocessable", "422", "Schema-valid but semantically rejected (e.g. payment intent with mismatched currency)."],
              ["rate_limited", "429", "Per-integrator throttle exceeded. Retry-After header carries the retry window."],
              ["upstream_failure", "502", "An MDA-side or aggregator-side adapter returned an error. Inspect details.upstream."],
              ["upstream_timeout", "504", "Adapter didn't respond inside the per-MDA timeout budget."],
            ].map(([code, http, meaning]) => (
              <tr key={code} className="border-b border-border last:border-b-0">
                <td className="px-3 py-2 font-mono text-[12.5px]">{code}</td>
                <td className="px-3 py-2 font-mono text-[12.5px]">{http}</td>
                <td className="px-3 py-2 text-muted-foreground">{meaning}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <H2 id="pagination">Pagination</H2>
      <P>
        List endpoints accept <Code>start</Code> (offset) and <Code>limit</Code>{" "}
        (page size). Default limit is 100; maximum is 500. Cursor-based
        pagination is on the v2 roadmap for endpoints whose total set can
        exceed ten thousand rows — the catalogue endpoints stay offset-based.
      </P>
      <CodeBlock
        language="bash"
        code={`curl "https://sente-rails.space/v1/mdas?start=0&limit=20"`}
      />
      <Callout variant="tip" title="Always read pagination.has_more">
        <p>
          Don&apos;t assume the absence of <Code>has_more=true</Code> means
          you&apos;ve seen everything. Read the flag, not the row count.
        </p>
      </Callout>

      <H2 id="idempotency">Idempotency</H2>
      <P>
        Mutating endpoints (POST, PUT, DELETE) accept an{" "}
        <Code>Idempotency-Key</Code> header. The rail stores the original
        response under that key for 24 hours; replaying the request with the
        same key returns the same response without re-executing the side
        effect.
      </P>
      <CodeBlock
        language="bash"
        code={`curl -X POST https://sente-rails.space/v1/assessments \\
  -H "Authorization: Bearer sk_sandbox_..." \\
  -H "Idempotency-Key: 7f8e3c1a-2b4d-4e5f-9a8b-1c2d3e4f5a6b" \\
  -H "Content-Type: application/json" \\
  -d '{ "citizen": "CM78001234ABCD", "lines": [...] }'`}
      />
      <UL>
        <li>Use a fresh UUID per logical operation.</li>
        <li>
          Replaying with the same key + a different body returns{" "}
          <Code>409 conflict</Code> — the key is bound to its original body.
        </li>
        <li>
          The aggregator-facing payment endpoints carry idempotency at two
          layers: this header for our side, plus the aggregator&apos;s own
          mechanism for theirs. Both are required.
        </li>
      </UL>

      <H2 id="rate-limits">Rate limits</H2>
      <P>
        Per-integrator throttle: <Code>120 requests / minute</Code> per token
        for read endpoints, <Code>60 / minute</Code> for write endpoints,{" "}
        <Code>30 / minute</Code> for payment endpoints. Limits are bursty —
        the bucket refills smoothly inside the minute window, so brief spikes
        don&apos;t trip them.
      </P>
      <P>
        On throttle, the response is <Code>429</Code> with three response
        headers:
      </P>
      <CodeBlock
        language="http"
        code={`HTTP/1.1 429 Too Many Requests
Retry-After: 12
X-Sente-RateLimit-Limit: 120
X-Sente-RateLimit-Remaining: 0`}
      />

      <H2 id="dates">Dates, times, and currency</H2>
      <UL>
        <li>
          <strong>Datetimes.</strong> Always ISO 8601 with a <Code>Z</Code>{" "}
          suffix (UTC). Sample: <Code>2026-05-25T08:30:11Z</Code>. We never
          serialise local-tz strings; if you need Africa/Kampala display, do
          it client-side from the UTC value.
        </li>
        <li>
          <strong>Dates.</strong> ISO 8601 date-only: <Code>2026-05-25</Code>.
        </li>
        <li>
          <strong>Currency amounts.</strong> Stored and transmitted as integer{" "}
          <strong>minor units</strong> (e.g. UGX 50,000 is sent as{" "}
          <Code>50000</Code>). No decimal points on the wire; the unit is
          carried separately in <Code>currency</Code>.
        </li>
        <li>
          <strong>Phone numbers.</strong> E.164 format with the leading{" "}
          <Code>+</Code> (e.g. <Code>+256772123456</Code>). The rail rejects
          locally-formatted numbers (no <Code>0772...</Code>).
        </li>
      </UL>

      <H2 id="request-id">Request IDs</H2>
      <P>
        Every response carries an <Code>X-Sente-Request-Id</Code> header. The
        same ID is also embedded inside the response envelope for errors.
        Include it in any support correspondence — we can trace a single ID
        end-to-end across the rail, the audit log, and any upstream MDA call.
      </P>

      <H2 id="reference">Reference</H2>
      <P>
        The complete OpenAPI 3.1 specification — every endpoint, every field,
        every error path — is browsable in the live{" "}
        <A to="/docs/explorer">API explorer</A>, and is exportable as OpenAPI
        or a Postman / Insomnia / Bruno collection from there.
      </P>
    </DocPage>
  );
}
