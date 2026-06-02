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
// Audience router — three personas, three explicit next steps.
// The "shouldn't get lost" hook: every visitor sees a card that says
// "this is you" and a CTA that goes somewhere useful immediately.

import { Link } from "@tanstack/react-router";
import { Building2, Code2, Eye, type LucideIcon } from "lucide-react";

type Audience = {
  icon: LucideIcon;
  label: string;
  desc: string;
  cta:
    | { to: "/signup" | "/docs/security"; label: string }
    | { href: string; label: string };
};

const AUDIENCES: Audience[] = [
  {
    icon: Code2,
    label: "I'm building an app",
    desc: "Get a free sandbox key. Real API access, real audit log, real docs. Sixty seconds.",
    cta: { to: "/signup", label: "Get a sandbox key" },
  },
  {
    icon: Building2,
    label: "I run an MDA",
    desc: "List your services on the rail. Citizens pay you directly via MoMo or Airtel; we never hold the funds.",
    cta: { href: "mailto:asatlabs@gmail.com?subject=MDA%20onboarding", label: "Talk to ops" },
  },
  {
    icon: Eye,
    label: "I'm a regulator / auditor",
    desc: "Read-only oversight access — aggregates, audit trail, anomaly flags. Mode-C integrator profile.",
    cta: { to: "/docs/security", label: "Oversight surface" },
  },
];

export function AudienceRouter() {
  return (
    <section className="border-b border-border bg-surface-muted/30">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <header className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
            Pick your path
          </p>
          <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Who is this for?
          </h2>
        </header>
        <div className="mt-8 grid gap-3 sm:gap-4 sm:grid-cols-3">
          {AUDIENCES.map((a) => (
            <article
              key={a.label}
              className="flex flex-col rounded-lg border border-border bg-background p-5"
            >
              <a.icon className="h-5 w-5 text-primary" />
              <h3 className="mt-3 font-display text-base font-semibold">{a.label}</h3>
              <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted-foreground">
                {a.desc}
              </p>
              {"to" in a.cta ? (
                <Link
                  to={a.cta.to}
                  className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  {a.cta.label} →
                </Link>
              ) : (
                <a
                  href={a.cta.href}
                  className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  {a.cta.label} →
                </a>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
