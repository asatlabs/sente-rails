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
// /docs/catalogue/services — public service catalogue across every connected MDA.
//
// Reads live data from /v1/services. No auth — public reference. Each row is
// one orderable service (a fee or compliance interaction a citizen / business
// may pay). Group-by-MDA in the UI; counter-station operators consume the
// same endpoint via /work/assess.

import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight } from "lucide-react";
import { DocPage } from "@/lib/docs/layout";
import { fetchServices, feeLabel, efrisLabel, type Service } from "@/lib/services";

export const Route = createFileRoute("/docs/catalogue/services")({
  head: () => ({
    meta: [
      { title: "Service catalogue · Sente Rails" },
      {
        name: "description",
        content:
          "Every service exposed through Sente Rails — fees, fee bases, EFRIS status, the MDAs they belong to.",
      },
    ],
  }),
  loader: () => fetchServices().catch(() => []),
  component: ServicesCatalogue,
});

function ServicesCatalogue() {
  const services = Route.useLoaderData();

  const byMda = useMemo(() => {
    const map = new Map<string, Service[]>();
    for (const svc of services) {
      const k = svc.mda || "—";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(svc);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [services]);

  const efrisCount = services.filter((s) => s.efris_taxable).length;

  return (
    <DocPage
      eyebrow="Catalogue"
      title="Service catalogue"
      description={
        `${services.length} services across ${byMda.length} MDA${byMda.length === 1 ? "" : "s"} — ${efrisCount} EFRIS-taxable.`
      }
      next={[
        {
          to: "/docs/catalogue/agencies",
          label: "Agency catalogue",
          description: "Every MDA on the rail — integration mode, endpoint counts, status.",
        },
        {
          to: "/docs/quick-start",
          label: "Quick start",
          description: "Run a citizen → assessment → payment round-trip end-to-end.",
        },
      ]}
    >
      {byMda.length === 0 && (
        <p className="text-sm text-muted-foreground">No services published yet.</p>
      )}

      <div className="space-y-6">
        {byMda.map(([mda, svcs]) => (
          <Card key={mda} className="border-border shadow-none">
            <CardContent className="p-0">
              <div className="flex items-center justify-between border-b border-border bg-surface-muted px-5 py-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Agency
                  </p>
                  <p className="font-display text-base font-semibold text-foreground">{mda}</p>
                </div>
                <p className="text-xs font-mono text-muted-foreground">
                  {svcs.length} service{svcs.length === 1 ? "" : "s"}
                </p>
              </div>
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left font-semibold px-5 py-2.5">Code</th>
                    <th className="text-left font-semibold px-3 py-2.5">Service</th>
                    <th className="text-left font-semibold px-3 py-2.5">Family</th>
                    <th className="text-left font-semibold px-3 py-2.5">Fee</th>
                    <th className="text-left font-semibold px-3 py-2.5">EFRIS</th>
                    <th className="text-left font-semibold px-5 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {svcs.map((s) => (
                    <tr key={s.name} className="hover:bg-surface-muted/60">
                      <td className="px-5 py-2.5 font-mono text-xs">{s.code}</td>
                      <td className="px-3 py-2.5">
                        <p className="text-sm">{s.service_name}</p>
                        <p className="text-[11px] font-mono text-muted-foreground">{s.name}</p>
                      </td>
                      <td className="px-3 py-2.5 text-xs">{s.service_family ?? "—"}</td>
                      <td className="px-3 py-2.5 font-mono text-xs">{feeLabel(s)}</td>
                      <td className="px-3 py-2.5 text-xs">{efrisLabel(s)}</td>
                      <td className="px-5 py-2.5">
                        <Badge
                          className={
                            s.status === "Active"
                              ? "bg-success/15 text-success border-0"
                              : "bg-muted text-muted-foreground border-0"
                          }
                        >
                          {s.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-8 rounded-md border border-border bg-surface-muted p-4">
        <p className="text-sm">
          <span className="font-medium text-foreground">Looking for the API contract?</span>{" "}
          <Link to="/docs/explorer" className="text-primary hover:underline">
            Open the API explorer
          </Link>
          <ArrowUpRight className="ml-0.5 inline h-3.5 w-3.5 align-text-bottom text-primary" />{" "}
          for full request/response schemas, or browse <code className="rounded bg-background px-1 py-0.5 font-mono text-[11.5px]">/v1/services</code> directly.
        </p>
      </div>
    </DocPage>
  );
}
