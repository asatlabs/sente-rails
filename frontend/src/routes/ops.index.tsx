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
// /ops — operations overview: at-a-glance counts + system health snapshot.

import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Building2,
  Boxes,
  KeyRound,
  ScrollText,
  Users,
  Activity,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  fetchOpsOversightStats,
  fetchOpsSystem,
  useOpsOversightStats,
  useOpsSystem,
  type Stats,
  type SystemHealth,
} from "@/lib/ops";

export const Route = createFileRoute("/ops/")({
  head: () => ({ meta: [{ title: "Operations · Sente Rails" }] }),
  loader: async () => {
    const [stats, sys] = await Promise.all([
      fetchOpsOversightStats().catch(() => null as Stats | null),
      fetchOpsSystem().catch(() => null as SystemHealth | null),
    ]);
    return { stats, sys };
  },
  component: OpsOverview,
});

function OpsOverview() {
  const { stats: initialStats, sys: initialSys } = Route.useLoaderData();
  const { data: stats, isLoading: sLoading } = useOpsOversightStats(initialStats ?? undefined);
  const { data: sys, isLoading: hLoading } = useOpsSystem(initialSys ?? undefined);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Operations Console
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Day-to-day rail administration. MDAs, services, integrators, keys,
          audit, oversight — all live + writable from the public web.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile icon={Building2} label="MDAs" value={stats?.mdas_total} to="/ops/mdas" loading={sLoading} />
        <Tile icon={Boxes} label="Services" value={stats?.services_total} to="/ops/services" loading={sLoading} />
        <Tile icon={Users} label="Integrators (active)" value={stats?.integrators_active} sub={`of ${stats?.integrators_total ?? "—"}`} to="/ops/integrators" loading={sLoading} />
        <Tile icon={KeyRound} label="Active keys" value={stats?.keys_active} to="/ops/keys" loading={sLoading} />
        <Tile icon={ScrollText} label="API calls (7d)" value={stats?.audit_7d} to="/ops/audit" loading={sLoading} />
        <Tile icon={Activity} label="Open anomaly flags" value={stats?.anomaly_flags_open} to="/ops/oversight" loading={sLoading} />
      </section>

      <Card className="border-border shadow-none">
        <CardContent className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-base font-semibold">System health</h2>
            <Link to="/ops/system" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
              Full health <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          {hLoading || !sys ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Adapters
                </p>
                <p className="mt-1 font-mono">
                  <Badge className="border-0 bg-success/15 text-success">
                    {sys.adapters.live ?? "—"} live
                  </Badge>{" "}
                  <Badge className="border-0 bg-muted text-muted-foreground">
                    {sys.adapters.stub ?? "—"} stub
                  </Badge>
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Audit log
                </p>
                <p className="mt-1 font-mono">
                  {sys.audit_log.row_count.toLocaleString()} rows
                </p>
                <p className="text-[11px] text-muted-foreground">
                  oldest: {sys.audit_log.oldest_ts ? new Date(sys.audit_log.oldest_ts).toLocaleDateString() : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Build
                </p>
                <p className="mt-1 font-mono text-xs">
                  {sys.build.git_head ?? "—"}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Tile({
  icon: Icon,
  label,
  value,
  sub,
  to,
  loading,
}: {
  icon: typeof Building2;
  label: string;
  value: number | undefined;
  sub?: string;
  to: string;
  loading: boolean;
}) {
  return (
    <Link to={to} className="group block">
      <Card className="border-border shadow-none transition-colors group-hover:border-primary/40">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {label}
            </p>
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="mt-2 font-display text-2xl font-semibold">
            {loading ? "…" : (value?.toLocaleString() ?? "0")}
            {sub && (
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                {sub}
              </span>
            )}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
