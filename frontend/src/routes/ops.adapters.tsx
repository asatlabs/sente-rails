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
// /ops/adapters — live registry of identity/fiscal/payment/SMS/cadastre/etc. adapters.

import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fetchOpsAdapters, useOpsAdapters, type AdapterRegistry } from "@/lib/ops";

export const Route = createFileRoute("/ops/adapters")({
  head: () => ({ meta: [{ title: "Adapters · Ops" }] }),
  loader: () => fetchOpsAdapters().catch(() => ({} as AdapterRegistry)),
  component: AdaptersPage,
});

type AdapterMeta = {
  class_path: string;
  importable: boolean;
  stub: boolean;
  supported_channels: string[] | null;
};

function AdaptersPage() {
  const initialReg = Route.useLoaderData();
  const { data: reg = initialReg, isLoading } = useOpsAdapters(initialReg);

  if (isLoading || !reg) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const countries = Object.keys(reg).sort();

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Adapter registry</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          External-system adapters grouped by country + role. ``stub`` means
          calls return canned responses; ``live`` means real HTTP traffic
          against the partner&apos;s sandbox or production endpoint.
        </p>
      </header>

      {countries.map((country) => (
        <Card key={country} className="border-border shadow-none">
          <CardContent className="p-5">
            <h2 className="font-display text-lg font-semibold">{country}</h2>
            <div className="mt-3 space-y-2">
              {Object.entries(reg[country]).map(([role, value]) => {
                const items = Array.isArray(value) ? value : [value];
                return (
                  <div key={role} className="border-b border-border pb-2 last:border-b-0">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {role}
                    </p>
                    <div className="mt-1 space-y-1">
                      {items.map((it: AdapterMeta, i: number) => (
                        <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                          <code className="font-mono text-xs">{it.class_path}</code>
                          <Badge
                            className={
                              it.stub
                                ? "border-0 bg-muted text-muted-foreground text-[10px]"
                                : "border-0 bg-success/15 text-success text-[10px]"
                            }
                          >
                            {it.stub ? "stub" : "live"}
                          </Badge>
                          {!it.importable && (
                            <Badge className="border-0 bg-destructive/15 text-destructive text-[10px]">
                              import-failed
                            </Badge>
                          )}
                          {it.supported_channels && it.supported_channels.length > 0 && (
                            <span className="text-xs text-muted-foreground">
                              {it.supported_channels.join(", ")}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
