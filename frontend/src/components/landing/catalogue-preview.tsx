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
// Catalogue preview — live read from /v1/mdas. 8-card grid, sorted to
// lead with the most-progressed agencies. Real status pills, real
// endpoint counts.

import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { statusPillClass, statusLabel, type Agency } from "@/lib/agencies";
import { AgencyIcon } from "@/lib/agency-icon";

const STATUS_ORDER: Record<string, number> = {
  live: 0,
  sandbox: 1,
  planned: 2,
  inquiry: 3,
};

interface Props {
  agencies: Agency[];
}

export function CataloguePreview({ agencies }: Props) {
  const sorted = [...agencies].sort(
    (a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9),
  );
  const top = sorted.slice(0, 8);

  return (
    <section className="border-b border-border bg-background">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
              Connected agencies
            </p>
            <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              {agencies.length} MDAs across Uganda
            </h2>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Pulled live from <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-[11.5px]">/v1/mdas</code>.
              Same data the workbench renders.
            </p>
          </div>
          <Link
            to="/docs/catalogue/agencies"
            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:border-primary/40 hover:text-foreground"
          >
            Browse all <ArrowRight className="h-3 w-3" />
          </Link>
        </header>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {top.map((a) => (
            <article
              key={a.code}
              className="flex items-center gap-3 rounded-lg border border-border bg-background p-3 transition-colors hover:border-primary/40"
            >
              <AgencyIcon agency={a} size="h-9 w-9" iconSize={15} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{a.full}</p>
                <p className="text-[11px] text-muted-foreground">
                  {a.category}
                  <span className="text-muted-foreground/60"> · {a.endpoints} endpts</span>
                </p>
              </div>
              <Badge className={`shrink-0 text-[10px] ${statusPillClass(a.status)}`}>
                {statusLabel(a.status)}
              </Badge>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
