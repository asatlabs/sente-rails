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
// /ops/oversight — OAG views. Aggregates + anomaly flags + payment events +
// citizen consent + statistics, on tabs.

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  fetchOpsOversightStats,
  fetchOpsAggregates,
  fetchOpsAnomalyFlags,
  fetchOpsPaymentEvents,
  fetchOpsConsentEvents,
  useOpsOversightStats,
  useOpsAggregates,
  useOpsAnomalyFlags,
  useOpsPaymentEvents,
  useOpsConsentEvents,
  type Stats,
  type AggregatesResult,
} from "@/lib/ops";

export const Route = createFileRoute("/ops/oversight")({
  head: () => ({ meta: [{ title: "Oversight · Ops" }] }),
  // Five-way parallel fetch — same primitive the landing page uses.
  // Tabs become instant on switch since all data is pre-paint.
  loader: async () => {
    const [stats, aggregates, anomalies, payments, consent] = await Promise.all([
      fetchOpsOversightStats().catch(() => null as Stats | null),
      fetchOpsAggregates().catch(() => null as AggregatesResult | null),
      fetchOpsAnomalyFlags().catch(() => [] as Record<string, unknown>[]),
      fetchOpsPaymentEvents().catch(() => [] as Record<string, unknown>[]),
      fetchOpsConsentEvents().catch(() => [] as Record<string, unknown>[]),
    ]);
    return { stats, aggregates, anomalies, payments, consent };
  },
  component: OversightPage,
});

const TABS = [
  { key: "stats", label: "Statistics" },
  { key: "aggregates", label: "Revenue · 30d" },
  { key: "anomalies", label: "Anomaly flags" },
  { key: "payments", label: "Payment events" },
  { key: "consent", label: "Citizen consent" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function OversightPage() {
  const [tab, setTab] = useState<TabKey>("stats");

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Oversight</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          OAG / MoFPED / UBOS / MoLG read-only views into the rail. Same data
          available via the /v1/oversight/* endpoints with a mode-C API key.
        </p>
      </header>

      <nav className="-mb-px flex flex-wrap gap-1 border-b border-border" aria-label="Oversight tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
              tab === t.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "stats" && <StatsTab />}
      {tab === "aggregates" && <AggregatesTab />}
      {tab === "anomalies" && <AnomaliesTab />}
      {tab === "payments" && <PaymentsTab />}
      {tab === "consent" && <ConsentTab />}
    </div>
  );
}

function StatsTab() {
  const { stats: initial } = Route.useLoaderData();
  const { data: stats, isLoading } = useOpsOversightStats(initial ?? undefined);
  if (isLoading || !stats) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const labels: Record<string, string> = {
    citizens_total: "Citizens",
    integrators_total: "Integrators",
    integrators_active: "Integrators (active)",
    mdas_total: "MDAs",
    services_total: "Services",
    keys_active: "Active keys",
    audit_total: "Audit rows",
    audit_7d: "Audit · 7d",
    anomaly_flags_total: "Anomaly flags",
    anomaly_flags_open: "Anomaly · open",
    payment_events_total: "Payment events",
  };
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Object.entries(labels).map(([k, label]) => (
        <Card key={k} className="border-border shadow-none">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="mt-1 font-display text-2xl font-semibold font-mono">
              {(stats[k] ?? 0).toLocaleString()}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function AggregatesTab() {
  const { aggregates: initial } = Route.useLoaderData();
  const { data, isLoading } = useOpsAggregates(initial ?? undefined);
  if (isLoading || !data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (data.by_mda.length === 0) {
    return (
      <Card className="border-border shadow-none">
        <CardContent className="p-5 text-sm text-muted-foreground">
          No settled payment events in the last 30 days.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="border-border shadow-none">
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">MDA</th>
              <th className="px-3 py-2 text-right font-semibold">Events</th>
              <th className="px-3 py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.by_mda.map((r) => (
              <tr key={r.mda}>
                <td className="px-3 py-1.5 font-mono text-xs">{r.mda}</td>
                <td className="px-3 py-1.5 text-right font-mono text-xs">{r.event_count.toLocaleString()}</td>
                <td className="px-3 py-1.5 text-right font-mono text-xs">{r.total_amount.toLocaleString()}</td>
              </tr>
            ))}
            <tr className="bg-surface-muted font-medium">
              <td className="px-3 py-1.5 text-xs">Total · {data.totals.window_days}d</td>
              <td className="px-3 py-1.5 text-right font-mono text-xs">{data.totals.event_count.toLocaleString()}</td>
              <td className="px-3 py-1.5 text-right font-mono text-xs">{data.totals.total_amount.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function AnomaliesTab() {
  const { anomalies: initial } = Route.useLoaderData();
  const { data: rows = initial, isLoading } = useOpsAnomalyFlags(initial);
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (rows.length === 0) {
    return (
      <Card className="border-border shadow-none">
        <CardContent className="p-5 text-sm text-muted-foreground">
          No anomaly flags raised yet.
        </CardContent>
      </Card>
    );
  }
  return <GenericRowTable rows={rows} />;
}

function PaymentsTab() {
  const { payments: initial } = Route.useLoaderData();
  const { data: rows = initial, isLoading } = useOpsPaymentEvents(initial);
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (rows.length === 0) {
    return (
      <Card className="border-border shadow-none">
        <CardContent className="p-5 text-sm text-muted-foreground">
          No payment events yet.
        </CardContent>
      </Card>
    );
  }
  return <GenericRowTable rows={rows} />;
}

function ConsentTab() {
  const { consent: initial } = Route.useLoaderData();
  const { data: rows = initial, isLoading } = useOpsConsentEvents(initial);
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (rows.length === 0) {
    return (
      <Card className="border-border shadow-none">
        <CardContent className="p-5 text-sm text-muted-foreground">
          No citizen consent events recorded yet.
        </CardContent>
      </Card>
    );
  }
  return <GenericRowTable rows={rows} />;
}

function GenericRowTable({ rows }: { rows: Record<string, unknown>[] }) {
  // Use the first row's keys as the column set (excluding "name" for compactness)
  const cols = Object.keys(rows[0]).filter((k) => k !== "name");
  return (
    <Card className="border-border shadow-none">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                {cols.map((c) => (
                  <th key={c} className="px-3 py-2 text-left font-semibold">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-surface-muted/60">
                  {cols.map((c) => (
                    <td key={c} className="px-3 py-1.5 font-mono text-xs">
                      {String(r[c] ?? "—").slice(0, 100)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
