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
// /docs/catalogue/agencies — public directory of every connected MDA.
//
// Reads live data from /v1/mdas. No auth — the catalogue is public reference
// material every integrator (and the public) can browse. Operator actions
// (onboard, suspend) live in the Ops Console at /ops/mdas.

import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DocPage } from "@/lib/docs/layout";
import { fetchAgencies, statusPillClass, statusLabel } from "@/lib/agencies";
import { AgencyIcon } from "@/lib/agency-icon";

export const Route = createFileRoute("/docs/catalogue/agencies")({
  head: () => ({
    meta: [
      { title: "Agency catalogue · Sente Rails" },
      {
        name: "description",
        content:
          "Directory of every Ugandan government agency connected to Sente Rails — ministries, authorities, local governments, and their integration status.",
      },
    ],
  }),
  loader: () => fetchAgencies().catch(() => []),
  component: AgenciesCatalogue,
});

function AgenciesCatalogue() {
  const agencies = Route.useLoaderData();
  const liveCount = agencies.filter((a) => a.status === "live").length;
  const sandboxCount = agencies.filter((a) => a.status === "sandbox").length;
  const plannedCount = agencies.filter((a) => a.status === "planned").length;

  return (
    <DocPage
      eyebrow="Catalogue"
      title="Connected agencies"
      description={`${agencies.length} agencies on the rail — ${liveCount} live, ${sandboxCount} in sandbox, ${plannedCount} planned.`}
      next={[
        {
          to: "/docs/catalogue/services",
          label: "Services catalogue",
          description: "Every service each agency exposes — fees, fee bases, EFRIS status.",
        },
        {
          to: "/docs/quick-start",
          label: "Quick start",
          description: "Use this catalogue in your first end-to-end integration.",
        },
      ]}
    >
      <Card className="border-border shadow-none">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left font-semibold px-5 py-3">Agency</th>
                  <th className="text-left font-semibold px-3 py-3">Category</th>
                  <th className="text-left font-semibold px-3 py-3">Endpoints</th>
                  <th className="text-left font-semibold px-3 py-3">Mode</th>
                  <th className="text-left font-semibold px-3 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {agencies.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-sm text-muted-foreground">
                      No agencies connected yet.
                    </td>
                  </tr>
                )}
                {agencies.map((a) => (
                  <tr key={a.code} className="hover:bg-surface-muted/60">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <AgencyIcon agency={a} size="h-9 w-9" iconSize={16} />
                        <div>
                          <p className="font-medium text-sm">{a.full}</p>
                          <p className="text-xs text-muted-foreground">{a.name}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs">{a.category}</td>
                    <td className="px-3 py-3 font-mono text-xs">
                      {a.endpoints}
                      {a.endpoints_is_target && (
                        <span className="ml-1 text-[10px] text-muted-foreground">planned</span>
                      )}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs">{a.mode}</td>
                    <td className="px-3 py-3">
                      <Badge className={statusPillClass(a.status)}>{statusLabel(a.status)}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </DocPage>
  );
}
