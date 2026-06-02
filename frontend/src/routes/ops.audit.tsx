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
// /ops/audit — full audit log across all integrators. No 90-day clamp.

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, CircleX, Filter, RotateCw, ShieldOff } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchOpsAudit, useOpsAudit, type AuditRow, type OpsAuditFilters } from "@/lib/ops";

export const Route = createFileRoute("/ops/audit")({
  head: () => ({ meta: [{ title: "Audit log · Ops" }] }),
  // First-paint slice: no filters, limit 200. Filter changes happen
  // client-side via useOpsAudit's queryKey-on-filters.
  loader: () => fetchOpsAudit({ limit: 200 }).catch(() => [] as AuditRow[]),
  component: AuditPage,
});

function statusClass(s: number): string {
  if (s === 0) return "text-muted-foreground";
  if (s < 300) return "text-success";
  if (s < 400) return "text-info";
  if (s < 500) return "text-warning-foreground";
  return "text-destructive";
}

function eventIcon(ev: string) {
  if (ev === "api.auth.granted") return <CheckCircle2 className="h-3 w-3 text-success" />;
  if (ev === "api.auth.denied") return <ShieldOff className="h-3 w-3 text-warning-foreground" />;
  if (ev === "api.handler.error") return <CircleX className="h-3 w-3 text-destructive" />;
  return null;
}

function AuditPage() {
  const [integrator, setIntegrator] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [event, setEvent] = useState("");
  const [minStatus, setMinStatus] = useState<number | undefined>(undefined);
  const [filters, setFilters] = useState<OpsAuditFilters>({ limit: 200 });

  const initialRows = Route.useLoaderData();
  // Loader data matches the no-extra-filter base; once the user applies
  // filters the queryKey changes and useOpsAudit fetches fresh.
  const isBaseQuery = !filters.integrator && !filters.endpoint && !filters.event && filters.min_status === undefined;
  const { data: rows = initialRows, isLoading, refetch, isFetching } = useOpsAudit(
    filters,
    isBaseQuery ? initialRows : undefined,
  );

  function apply() {
    setFilters({
      limit: 200,
      integrator: integrator.trim() || undefined,
      endpoint: endpoint.trim() || undefined,
      event: event.trim() || undefined,
      min_status: minStatus,
    });
  }

  function reset() {
    setIntegrator("");
    setEndpoint("");
    setEvent("");
    setMinStatus(undefined);
    setFilters({ limit: 200 });
  }

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Audit log</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            All /v1 traffic + ops actions, across every integrator. No 90-day clamp here — operator view sees everything to the 7-year purge floor.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RotateCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
      </header>

      <Card className="border-border shadow-none">
        <CardContent className="grid gap-3 p-4 sm:grid-cols-[1fr_1fr_1fr_120px_auto]">
          <div className="space-y-1">
            <Label className="text-xs">Integrator</Label>
            <Input value={integrator} onChange={(e) => setIntegrator(e.target.value)} placeholder="PHASE1B-SMOKE-WZ9Z2E" className="h-9" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Endpoint contains</Label>
            <Input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="/v1/citizens" className="h-9" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Event</Label>
            <select value={event} onChange={(e) => setEvent(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">All</option>
              <option value="api.auth.granted">Granted</option>
              <option value="api.auth.denied">Denied</option>
              <option value="api.handler.error">Error</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Min HTTP</Label>
            <select value={minStatus ?? ""} onChange={(e) => setMinStatus(e.target.value ? Number(e.target.value) : undefined)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">Any</option>
              <option value="400">≥ 400</option>
              <option value="500">≥ 500</option>
            </select>
          </div>
          <div className="flex items-end gap-2">
            <Button onClick={apply} size="sm" className="h-9">
              <Filter className="mr-1 h-3.5 w-3.5" /> Apply
            </Button>
            <Button onClick={reset} variant="outline" size="sm" className="h-9">Reset</Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border shadow-none">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Time</th>
                  <th className="px-3 py-2 text-left font-semibold">Event</th>
                  <th className="px-3 py-2 text-left font-semibold">Integrator</th>
                  <th className="px-3 py-2 text-left font-semibold">Method</th>
                  <th className="px-3 py-2 text-left font-semibold">Endpoint</th>
                  <th className="px-3 py-2 text-right font-semibold">Status</th>
                  <th className="px-3 py-2 text-right font-semibold">Latency</th>
                  <th className="px-3 py-2 text-left font-semibold">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading && (
                  <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">Loading…</td></tr>
                )}
                {!isLoading && rows.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">No matches.</td></tr>
                )}
                {rows.map((r) => (
                  <tr key={r.name} className="hover:bg-surface-muted/60">
                    <td className="px-3 py-1.5 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                      {new Date(r.ts).toLocaleString()}
                    </td>
                    <td className="px-3 py-1.5">
                      <span className="inline-flex items-center gap-1 text-xs">
                        {eventIcon(r.event)}
                        <span>{r.event.replace("api.", "")}</span>
                      </span>
                    </td>
                    <td className="px-3 py-1.5 font-mono text-xs">{r.integrator ?? "—"}</td>
                    <td className="px-3 py-1.5 font-mono text-xs">{r.http_method ?? "—"}</td>
                    <td className="px-3 py-1.5 font-mono text-xs">{r.endpoint ?? "—"}</td>
                    <td className={`px-3 py-1.5 text-right font-mono text-xs font-semibold ${statusClass(r.http_status)}`}>
                      {r.http_status || "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs text-muted-foreground">
                      {r.latency_ms ? `${r.latency_ms}ms` : "—"}
                    </td>
                    <td className="px-3 py-1.5">
                      {r.error_code ? (
                        <Badge className="border-0 bg-destructive/10 text-destructive text-[10px]">
                          {r.error_code}
                        </Badge>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
