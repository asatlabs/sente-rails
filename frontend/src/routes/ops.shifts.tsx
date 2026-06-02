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
// /ops/shifts — cross-MDA view of every counter shift.

import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fetchOpsShifts, useOpsShifts, type ShiftRow } from "@/lib/ops";

export const Route = createFileRoute("/ops/shifts")({
  head: () => ({ meta: [{ title: "Shifts · Ops" }] }),
  loader: () => fetchOpsShifts().catch(() => [] as ShiftRow[]),
  component: ShiftsPage,
});

const STATUS_PILLS: Record<string, string> = {
  open: "bg-info/15 text-info border-0",
  closed: "bg-muted text-muted-foreground border-0",
  reconciling: "bg-warning/15 text-warning-foreground border-0",
};

function ShiftsPage() {
  const initialRows = Route.useLoaderData();
  const { data: rows = initialRows, isLoading } = useOpsShifts(initialRows);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Counter shifts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every counter shift across every MDA. Variance handling is in front
          door C (counter stations) — this is the read-only operator view.
        </p>
      </header>

      <Card className="border-border shadow-none">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Shift</th>
                  <th className="px-3 py-2 text-left font-semibold">MDA</th>
                  <th className="px-3 py-2 text-left font-semibold">Clerk</th>
                  <th className="px-3 py-2 text-left font-semibold">Opened</th>
                  <th className="px-3 py-2 text-left font-semibold">Closed</th>
                  <th className="px-3 py-2 text-right font-semibold">Expected</th>
                  <th className="px-3 py-2 text-right font-semibold">Counted</th>
                  <th className="px-3 py-2 text-right font-semibold">Variance</th>
                  <th className="px-3 py-2 text-left font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading && (
                  <tr><td colSpan={9} className="px-4 py-6 text-center text-muted-foreground">Loading…</td></tr>
                )}
                {!isLoading && rows.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-6 text-center text-muted-foreground">
                    No counter shifts have been opened yet. They&apos;ll appear here as MDA clerks start collecting.
                  </td></tr>
                )}
                {rows.map((s) => (
                  <tr key={s.name} className="hover:bg-surface-muted/60">
                    <td className="px-3 py-1.5 font-mono text-xs">{s.name}</td>
                    <td className="px-3 py-1.5 font-mono text-xs">{s.mda}</td>
                    <td className="px-3 py-1.5 text-xs">{s.clerk}</td>
                    <td className="px-3 py-1.5 text-[11px] font-mono text-muted-foreground">
                      {s.opened_at ? new Date(s.opened_at).toLocaleString() : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-[11px] font-mono text-muted-foreground">
                      {s.closed_at ? new Date(s.closed_at).toLocaleString() : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs">
                      {s.expected_total?.toLocaleString() ?? "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs">
                      {s.counted_total?.toLocaleString() ?? "—"}
                    </td>
                    <td className={`px-3 py-1.5 text-right font-mono text-xs ${(s.variance ?? 0) === 0 ? "" : "text-warning-foreground font-semibold"}`}>
                      {s.variance?.toLocaleString() ?? "—"}
                    </td>
                    <td className="px-3 py-1.5">
                      <Badge className={STATUS_PILLS[s.status] ?? "border-0 bg-muted text-muted-foreground"}>
                        {s.status}
                      </Badge>
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
