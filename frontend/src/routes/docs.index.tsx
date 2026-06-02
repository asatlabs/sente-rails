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
// /docs (index) — the developer-hub landing card grid.
// Each card is a real <Link> into the matching sub-page.

import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  BookOpen,
  ChefHat,
  Code2,
  ExternalLink,
  FileText,
  ShieldCheck,
  Webhook,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/docs/")({
  component: DocsIndex,
});

type Guide = {
  to: string;
  icon: LucideIcon;
  title: string;
  desc: string;
  meta: string;
};

const GUIDES: Guide[] = [
  {
    to: "/docs/quick-start",
    icon: BookOpen,
    title: "Quick start",
    desc: "From zero to your first cross-MDA assessment in under ten minutes. Real curl examples against the live sandbox.",
    meta: "5 steps · ~10 min",
  },
  {
    to: "/docs/security",
    icon: ShieldCheck,
    title: "Security & compliance",
    desc: "Authentication, signing, regulatory posture and the data-classification model that keeps the rail PDP-aligned end to end.",
    meta: "7 frameworks mapped",
  },
  {
    to: "/docs/api-standards",
    icon: FileText,
    title: "API standards",
    desc: "Versioning policy, error envelope, pagination conventions, idempotency keys, dates and currency. The contract every endpoint honours.",
    meta: "OpenAPI 3.1",
  },
  {
    to: "/docs/sdks",
    icon: Code2,
    title: "SDKs & samples",
    desc: "Postman collection, curl snippets per endpoint, and code for the most common citizen-service flows.",
    meta: "Postman + curl + Python + Node",
  },
  {
    to: "/docs/webhooks",
    icon: Webhook,
    title: "Webhooks",
    desc: "Event catalogue, signature verification, replay protection and retry semantics for inbound integrations from any MDA.",
    meta: "HMAC-SHA256 · 14 event types",
  },
  {
    to: "/docs/cookbook",
    icon: ChefHat,
    title: "Sandbox cookbook",
    desc: "Three end-to-end recipes: trading-licence renewal, Lands title transfer, cross-MDA business registration.",
    meta: "3 verticals · runnable",
  },
  {
    to: "/docs/catalogue/agencies",
    icon: BookOpen,
    title: "Agency catalogue",
    desc: "Live directory of every Ugandan government agency on the rail — ministries, authorities, local governments, integration status.",
    meta: "live · /v1/mdas",
  },
  {
    to: "/docs/catalogue/services",
    icon: FileText,
    title: "Service catalogue",
    desc: "Every service exposed through the rail — fees, fee bases, EFRIS status, grouped by MDA.",
    meta: "live · /v1/services",
  },
];

function DocsIndex() {
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
            Developer hub
          </p>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Documentation
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Standards, guides and reference material for building on Sente Rails.
            Every endpoint cited below is live in the sandbox at{" "}
            <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-[11.5px]">
              sente-rails.space/v1
            </code>
            .
          </p>
        </div>
        <div className="hidden shrink-0 items-center gap-2 rounded-md border border-border bg-surface-muted px-3 py-2 text-xs sm:flex">
          <span className="relative inline-flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <span className="font-medium text-foreground">Sandbox live</span>
          <span className="text-muted-foreground">·</span>
          <code className="font-mono text-[11px] text-muted-foreground">
            sente-rails.space/v1
          </code>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button asChild size="sm" className="h-9">
          <Link to="/docs/quick-start">Start with the 10-minute guide</Link>
        </Button>
        <Button asChild variant="outline" size="sm" className="h-9">
          <Link to="/docs/explorer">
            Open API reference
            <ArrowUpRight className="ml-1 h-3 w-3" />
          </Link>
        </Button>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {GUIDES.map((g) => (
          <Link
            key={g.to}
            to={g.to}
            className="group flex flex-col rounded-lg border border-border bg-background p-4 transition-colors hover:border-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <div className="flex items-center gap-2.5">
              <div className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                <g.icon className="h-4 w-4" />
              </div>
              <h3 className="font-display text-sm font-semibold text-foreground">
                {g.title}
              </h3>
            </div>
            <p className="mt-2 flex-1 text-[12.5px] leading-relaxed text-muted-foreground">
              {g.desc}
            </p>
            <p className="mt-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/80">
              {g.meta}
            </p>
          </Link>
        ))}
      </div>

      <div className="mt-10 grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface-muted p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Architecture brief
          </p>
          <p className="mt-1.5 text-sm text-foreground">
            The architecture brief, compliance matrix, and six architecture
            diagrams live in the repository under{" "}
            <code className="rounded bg-background px-1 py-0.5 font-mono text-[11.5px]">
              docs/
            </code>
            .
          </p>
          <a
            href="https://github.com/asatlabs/sente-rails/tree/main/docs"
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80"
          >
            View on GitHub <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
        <div className="rounded-lg border border-border bg-surface-muted p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Sandbox access
          </p>
          <p className="mt-1.5 text-sm text-foreground">
            Self-serve sign-up issues a key in under a minute — ten thousand
            calls per month, no card required, no expiry.
          </p>
          <Link
            to="/signup"
            className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80"
          >
            Get a sandbox key <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
