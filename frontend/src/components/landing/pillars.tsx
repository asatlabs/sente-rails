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
// Three product pillars — what you can build on the rail.

import { Link } from "@tanstack/react-router";
import { ArrowRight, Receipt, ShieldCheck, UserSearch } from "lucide-react";

const PILLARS = [
  {
    icon: UserSearch,
    title: "Identity",
    desc: "Look up citizens by NIN and businesses by URSB number. One request, two registries, scoped to your integration.",
    cta: { to: "/docs/quick-start", label: "How identity works" },
  },
  {
    icon: Receipt,
    title: "Assess + Pay",
    desc: "Compute multi-MDA fees, then take payment via MoMo, Airtel, Pesapal, or card. One API, every channel.",
    cta: { to: "/docs/cookbook", label: "Payment recipes" },
  },
  {
    icon: ShieldCheck,
    title: "Audit + Settle",
    desc: "Per-call audit trail. Settlement routes direct to each MDA's treasury account. The rail never holds public money. PFMA §43.",
    cta: { to: "/docs/security", label: "Compliance posture" },
  },
];

export function Pillars() {
  return (
    <section className="border-b border-border bg-background">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <header className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
            What you can build
          </p>
          <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Three primitives. Every government fee in Uganda.
          </h2>
        </header>
        <div className="mt-8 grid gap-3 sm:gap-4 sm:grid-cols-3">
          {PILLARS.map((p) => (
            <article
              key={p.title}
              className="group rounded-lg border border-border bg-background p-5 transition-colors hover:border-primary/40"
            >
              <div className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <p.icon className="h-4 w-4" />
              </div>
              <h3 className="mt-3 font-display text-base font-semibold">{p.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {p.desc}
              </p>
              <Link
                to={p.cta.to}
                className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary transition-transform group-hover:translate-x-0.5"
              >
                {p.cta.label}
                <ArrowRight className="h-3 w-3" />
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
