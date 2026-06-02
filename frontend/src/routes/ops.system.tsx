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
// /ops/system — operational health snapshot.

import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fetchOpsSystem, useOpsSystem, type SystemHealth } from "@/lib/ops";

export const Route = createFileRoute("/ops/system")({
  head: () => ({ meta: [{ title: "System · Ops" }] }),
  loader: () => fetchOpsSystem().catch(() => null as SystemHealth | null),
  component: SystemPage,
});

function SystemPage() {
  const initialSys = Route.useLoaderData();
  const { data: sys, isLoading } = useOpsSystem(initialSys ?? undefined);

  if (isLoading || !sys) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight">System health</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Operational snapshot — adapter live/stub split, audit log shape, scheduler heartbeat, build version.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="border-border shadow-none">
          <CardContent className="p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Audit log
            </h2>
            <p className="mt-2 font-display text-2xl font-semibold font-mono">
              {sys.audit_log.row_count.toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              rows · oldest{" "}
              <span className="font-mono text-foreground">
                {sys.audit_log.oldest_ts ? new Date(sys.audit_log.oldest_ts).toLocaleDateString() : "—"}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              newest{" "}
              <span className="font-mono text-foreground">
                {sys.audit_log.newest_ts ? new Date(sys.audit_log.newest_ts).toLocaleString() : "—"}
              </span>
            </p>
          </CardContent>
        </Card>

        <Card className="border-border shadow-none">
          <CardContent className="p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Adapters
            </h2>
            <p className="mt-2 font-display text-2xl font-semibold">
              <span className="font-mono text-success">{sys.adapters.live ?? "—"}</span>{" "}
              <span className="text-base font-normal text-muted-foreground">live</span>
              {" / "}
              <span className="font-mono">{sys.adapters.stub ?? "—"}</span>{" "}
              <span className="text-base font-normal text-muted-foreground">stub</span>
            </p>
          </CardContent>
        </Card>

        <Card className="border-border shadow-none">
          <CardContent className="p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Scheduler
            </h2>
            <p className="mt-2 text-sm">
              Daily key expiry sweep last ran:
            </p>
            <p className="mt-1 font-mono text-xs text-foreground">
              {sys.scheduler.last_daily_expiry_sweep
                ? new Date(sys.scheduler.last_daily_expiry_sweep).toLocaleString()
                : "(not recorded yet)"}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border shadow-none">
          <CardContent className="p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Catalogue
            </h2>
            <ul className="mt-2 space-y-1 text-sm">
              <li className="flex justify-between"><span>MDAs</span><span className="font-mono">{sys.counts.mdas}</span></li>
              <li className="flex justify-between"><span>Services</span><span className="font-mono">{sys.counts.services}</span></li>
              <li className="flex justify-between"><span>Integrators</span><span className="font-mono">{sys.counts.integrators}</span></li>
            </ul>
          </CardContent>
        </Card>

        <Card className="border-border shadow-none">
          <CardContent className="p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              API keys
            </h2>
            <ul className="mt-2 space-y-1 text-sm">
              <li className="flex justify-between">
                <span>Active</span>
                <Badge className="border-0 bg-success/15 text-success font-mono">{sys.counts.keys_active}</Badge>
              </li>
              <li className="flex justify-between">
                <span>Total</span>
                <span className="font-mono">{sys.counts.keys_total}</span>
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card className="border-border shadow-none">
          <CardContent className="p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Build
            </h2>
            <p className="mt-2 font-mono text-sm">
              {sys.build.git_head ?? "—"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              git short SHA of the live sente_rails checkout.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
