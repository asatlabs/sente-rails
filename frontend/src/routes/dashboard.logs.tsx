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
// /dashboard/logs — last 90 days of /v1 audit events for the signed-in integrator.

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, CircleX, Filter, Loader2, RotateCw, ShieldOff, TriangleAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchMyLogs, useMyLogs, type MeLogEntry } from "@/lib/me";

export const Route = createFileRoute("/dashboard/logs")({
  head: () => ({ meta: [{ title: "Request logs · Sente Rails" }] }),
  // SSR loader fetches the default first-paint slice (no filters,
  // limit 100). Client-side filter changes go through useMyLogs.
  loader: () => fetchMyLogs({ limit: 100 }).catch(() => [] as MeLogEntry[]),
  component: LogsPage,
});

function statusClass(s: number): string {
  if (s === 0) return "text-muted-foreground";
  if (s < 300) return "text-success";
  if (s < 400) return "text-info";
  if (s < 500) return "text-warning-foreground";
  return "text-destructive";
}

function eventIcon(ev: string) {
  if (ev === "api.auth.granted") return <CheckCircle2 className="h-3.5 w-3.5 text-success" />;
  if (ev === "api.auth.denied") return <ShieldOff className="h-3.5 w-3.5 text-warning-foreground" />;
  if (ev === "api.handler.error") return <CircleX className="h-3.5 w-3.5 text-destructive" />;
  return <TriangleAlert className="h-3.5 w-3.5 text-muted-foreground" />;
}

function LogsPage() {
  const [endpoint, setEndpoint] = useState("");
  const [event, setEvent] = useState("");
  const [minStatus, setMinStatus] = useState<number | undefined>(undefined);
  const [appliedFilters, setAppliedFilters] = useState<{
    endpoint?: string;
    event?: string;
    min_status?: number;
  }>({});

  const initialLogs = Route.useLoaderData();
  // Loader data only matches the no-filter base query. Once filters
  // are applied, the queryKey changes and React Query falls back to
  // its normal pending state for the filtered slice.
  const hasFilters = Object.keys(appliedFilters).length > 0;
  const { data: logs = initialLogs, isLoading, refetch, isFetching } = useMyLogs(
    { limit: 100, ...appliedFilters },
    hasFilters ? undefined : initialLogs,
  );

  function applyFilters() {
    setAppliedFilters({
      endpoint: endpoint.trim() || undefined,
      event: event.trim() || undefined,
      min_status: minStatus,
    });
  }

  function resetFilters() {
    setEndpoint("");
    setEvent("");
    setMinStatus(undefined);
    setAppliedFilters({});
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Request logs
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every /v1 call by this account in the last 90 days. Each row carries a
            request_id you can quote when reporting an issue.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RotateCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
      </header>

      <Card className="border-border shadow-none">
        <CardContent className="grid gap-3 p-4 sm:grid-cols-[1fr_1fr_120px_auto]">
          <div className="space-y-1.5">
            <Label htmlFor="ep" className="text-xs">Endpoint contains</Label>
            <Input
              id="ep"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="/v1/citizens"
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ev" className="text-xs">Event</Label>
            <select
              id="ev"
              value={event}
              onChange={(e) => setEvent(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">All</option>
              <option value="api.auth.granted">Granted</option>
              <option value="api.auth.denied">Denied</option>
              <option value="api.handler.error">Error</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ms" className="text-xs">Min status</Label>
            <select
              id="ms"
              value={minStatus ?? ""}
              onChange={(e) => setMinStatus(e.target.value ? Number(e.target.value) : undefined)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Any</option>
              <option value="400">≥ 400</option>
              <option value="500">≥ 500</option>
            </select>
          </div>
          <div className="flex items-end gap-2">
            <Button onClick={applyFilters} size="sm" className="h-9">
              <Filter className="mr-1 h-3.5 w-3.5" /> Apply
            </Button>
            <Button onClick={resetFilters} variant="outline" size="sm" className="h-9">
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border shadow-none">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold">Time</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Event</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Method</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Endpoint</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Status</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Latency</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Error</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Request id</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                      <span className="inline-flex items-center gap-2 text-sm">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                      </span>
                    </td>
                  </tr>
                )}
                {!isLoading && logs.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                    No events in the last 90 days that match these filters.
                  </td></tr>
                )}
                {logs.map((row: MeLogEntry) => (
                  <tr key={row.name} className="hover:bg-surface-muted/60">
                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(row.ts).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        {eventIcon(row.event)}
                        <span className="text-foreground">{row.event.replace("api.", "")}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{row.http_method ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{row.endpoint ?? "—"}</td>
                    <td className={`px-3 py-2 text-right font-mono text-xs font-semibold ${statusClass(row.http_status)}`}>
                      {row.http_status || "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
                      {row.latency_ms ? `${row.latency_ms}ms` : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {row.error_code ? (
                        <Badge className="border-0 bg-destructive/10 text-destructive text-[10px]">
                          {row.error_code}
                        </Badge>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-2 font-mono text-[11px] text-muted-foreground truncate max-w-[200px]">
                      {row.request_id ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        Showing up to 100 events from the last 90 days. For longer ranges or
        bulk export, contact ops.
      </p>
    </div>
  );
}
