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
// /work/supervisor — the oversight cockpit: variance approvals, the
// corrections ledger (refunds + waivers with who authorised them), and the
// open anomaly flags, scoped to the MDA the supervisor oversees.

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, Flag, Loader2, ShieldX, TriangleAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  fetchSupervisorDashboard,
  useSupervisorDashboard,
  useApproveVariance,
  useRejectVariance,
  useResolveFlag,
  type SupervisorDashboard,
} from "@/lib/work";

export const Route = createFileRoute("/work/supervisor")({
  head: () => ({ meta: [{ title: "Supervisor · Work" }] }),
  loader: () => fetchSupervisorDashboard().catch(() => null as SupervisorDashboard | null),
  component: SupervisorPage,
});

function SupervisorPage() {
  const initialDash = Route.useLoaderData();
  const { data: dash, isLoading, refetch } = useSupervisorDashboard(initialDash ?? undefined);
  const [actionTarget, setActionTarget] = useState<{ name: string; mode: "approve" | "reject" } | null>(null);

  if (isLoading) return <p className="text-muted-foreground">Loading dashboard…</p>;
  if (!dash) {
    return (
      <Card className="border-destructive/30 bg-destructive/5 shadow-sm">
        <CardContent className="p-6 text-sm">
          Couldn&apos;t load the supervisor dashboard. Your account may not be scoped to an MDA yet — contact ops.
        </CardContent>
      </Card>
    );
  }

  const c = dash.counters;
  const money = (n: number) => `${c.currency} ${n.toLocaleString()}`;

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Supervisor station</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {dash.mda_name ?? "—"} · {dash.date}
            {dash.is_today ? " (today)" : ""}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()}>
          Refresh
        </Button>
      </header>

      {/* Tiles */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Tile label="Collected today" value={money(c.collected_today)} />
        <Tile label="Open shifts" value={String(c.open_shifts)} />
        <Tile label="Variances pending" value={String(c.variances_pending)} warn={c.variances_pending > 0} />
        <Tile label="Refunds today" value={String(c.refunds_today)} sub={c.refunds_today ? money(c.refunds_amount) : undefined} />
        <Tile label="Waivers today" value={String(c.waivers_today)} sub={c.waivers_today ? money(c.waivers_amount) : undefined} />
        <Tile label="Open flags" value={String(c.open_flags)} warn={c.open_flags > 0} />
      </div>

      {/* Anomaly flags */}
      {dash.flags.length > 0 && <FlagsPanel flags={dash.flags} />}

      {/* Variance queue */}
      <Card className="border-border shadow-sm">
        <CardContent className="p-0">
          <div className="border-b border-border px-5 py-3">
            <h2 className="font-display text-lg font-semibold">Variance queue</h2>
            <p className="text-xs text-muted-foreground">
              {dash.variance_queue.length} pending · approve to release the shift, reject to hold for a re-count.
            </p>
          </div>
          {dash.variance_queue.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              No variances pending. The counter shifts are reconciling cleanly.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold">Shift</th>
                  <th className="px-3 py-2 text-left font-semibold">Clerk</th>
                  <th className="px-3 py-2 text-right font-semibold">Expected</th>
                  <th className="px-3 py-2 text-right font-semibold">Counted</th>
                  <th className="px-3 py-2 text-right font-semibold">Variance</th>
                  <th className="px-4 py-2 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {dash.variance_queue.map((r) => (
                  <tr key={r.name}>
                    <td className="px-4 py-2 font-mono text-xs">{r.name}</td>
                    <td className="px-3 py-2 text-xs">{r.clerk}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{r.expected_total.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{r.counted_total.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs font-semibold text-warning-foreground">
                      {r.variance.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button size="sm" variant="outline" className="mr-1" onClick={() => setActionTarget({ name: r.name, mode: "approve" })}>
                        <CheckCircle2 className="mr-1 h-3 w-3 text-success" /> Approve
                      </Button>
                      <Button size="sm" variant="outline" className="text-destructive" onClick={() => setActionTarget({ name: r.name, mode: "reject" })}>
                        <ShieldX className="mr-1 h-3 w-3" /> Reject
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Corrections ledger */}
      <CorrectionsPanel corrections={dash.corrections} money={money} />

      {/* Channel mix + shift health */}
      <div className="grid gap-5 lg:grid-cols-2">
        <ChannelPanel byChannel={dash.by_channel} money={money} />
        <ServicePanel byService={dash.by_service} money={money} />
      </div>

      {actionTarget && <VarianceActionDialog target={actionTarget} onClose={() => setActionTarget(null)} />}
    </div>
  );
}

function Tile({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <Card className={`shadow-none ${warn ? "border-warning/40 bg-warning/5" : "border-border"}`}>
      <CardContent className="p-4">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-1 font-display text-2xl font-semibold">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

const SEVERITY_CLASS: Record<string, string> = {
  Critical: "bg-destructive/15 text-destructive",
  High: "bg-destructive/10 text-destructive",
  Medium: "bg-warning/15 text-warning-foreground",
  Low: "bg-muted text-muted-foreground",
};

function FlagsPanel({ flags }: { flags: SupervisorDashboard["flags"] }) {
  const resolve = useResolveFlag();
  const [busyName, setBusyName] = useState<string | null>(null);

  async function act(name: string, status: string) {
    setBusyName(name);
    try {
      await resolve.mutateAsync({ name, status });
    } finally {
      setBusyName(null);
    }
  }

  return (
    <Card className="border-destructive/30 bg-destructive/5 shadow-sm">
      <CardContent className="p-0">
        <div className="flex items-center gap-2 border-b border-destructive/20 px-5 py-3">
          <Flag className="h-4 w-4 text-destructive" />
          <h2 className="font-display text-lg font-semibold">Anomaly flags ({flags.length})</h2>
        </div>
        <ul className="divide-y divide-border">
          {flags.map((f) => (
            <li key={f.name} className="px-5 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge className={`border-0 ${SEVERITY_CLASS[f.severity] ?? "bg-muted"}`}>{f.severity}</Badge>
                    <span className="text-sm font-medium">{f.flag_type}</span>
                    <span className="text-xs text-muted-foreground">· {f.status}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{f.description}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                    {f.reference_doctype} {f.reference_name}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  {busyName === f.name ? (
                    <Loader2 className="h-4 w-4 animate-spin self-center" />
                  ) : (
                    <>
                      {f.status === "Open" && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => act(f.name, "Investigating")}>
                          Investigate
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => act(f.name, "Resolved")}>
                        Resolve
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => act(f.name, "False Positive")}>
                        False positive
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function CorrectionsPanel({
  corrections,
  money,
}: {
  corrections: SupervisorDashboard["corrections"];
  money: (n: number) => string;
}) {
  const { refunds, waivers } = corrections;
  return (
    <Card className="border-border shadow-sm">
      <CardContent className="p-0">
        <div className="border-b border-border px-5 py-3">
          <h2 className="font-display text-lg font-semibold">Corrections ledger</h2>
          <p className="text-xs text-muted-foreground">
            Every refund and waiver today, with the supervisor who authorised it.
          </p>
        </div>
        {refunds.length === 0 && waivers.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No corrections today.</p>
        ) : (
          <div className="divide-y divide-border">
            {refunds.map((r) => (
              <div key={r.intent} className="flex items-start justify-between gap-3 px-5 py-3 text-sm">
                <div className="min-w-0">
                  <Badge className="border-0 bg-destructive/10 text-destructive">Refund</Badge>
                  <span className="ml-2 font-mono text-xs">{r.intent}</span>
                  <p className="mt-1 text-xs text-muted-foreground">{r.reason || "—"}</p>
                  <p className="text-[11px] text-muted-foreground">
                    by {r.clerk ?? "—"} · authorised by <span className="font-medium">{r.authorized_by ?? "—"}</span>
                  </p>
                </div>
                <span className="shrink-0 font-mono text-sm font-semibold text-destructive">−{money(r.amount)}</span>
              </div>
            ))}
            {waivers.map((w) => (
              <div key={w.assessment} className="flex items-start justify-between gap-3 px-5 py-3 text-sm">
                <div className="min-w-0">
                  <Badge className="border-0 bg-warning/15 text-warning-foreground">Waiver</Badge>
                  <span className="ml-2 font-mono text-xs">{w.assessment}</span>
                  <p className="mt-1 text-xs text-muted-foreground">{w.reason || "—"}</p>
                  <p className="text-[11px] text-muted-foreground">
                    authorised by <span className="font-medium">{w.authorized_by ?? "—"}</span> · net {money(w.net)} of {money(w.gross)}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-sm font-semibold text-warning-foreground">−{money(w.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ChannelPanel({
  byChannel,
  money,
}: {
  byChannel: SupervisorDashboard["by_channel"];
  money: (n: number) => string;
}) {
  const active = byChannel.filter((c) => c.total > 0);
  return (
    <Card className="border-border shadow-sm">
      <CardContent className="p-5">
        <h2 className="mb-3 font-display text-base font-semibold">By payment method</h2>
        {active.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing collected yet.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {active.map((c) => (
              <li key={c.channel} className="flex justify-between">
                <span className="text-muted-foreground">
                  {c.channel} <span className="text-xs">· {c.share_pct}%</span>
                </span>
                <span className="font-mono">{money(c.total)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ServicePanel({
  byService,
  money,
}: {
  byService: SupervisorDashboard["by_service"];
  money: (n: number) => string;
}) {
  return (
    <Card className="border-border shadow-sm">
      <CardContent className="p-5">
        <h2 className="mb-3 font-display text-base font-semibold">By service</h2>
        {byService.length === 0 ? (
          <p className="text-sm text-muted-foreground">No services assessed yet.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {byService.slice(0, 8).map((s) => (
              <li key={s.service} className="flex justify-between gap-2">
                <span className="min-w-0 truncate text-muted-foreground">{s.service_name}</span>
                <span className="shrink-0 font-mono">{money(s.total)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function VarianceActionDialog({
  target,
  onClose,
}: {
  target: { name: string; mode: "approve" | "reject" };
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const approve = useApproveVariance();
  const reject = useRejectVariance();
  const busy = approve.isPending || reject.isPending;

  async function submit() {
    setError(null);
    try {
      if (target.mode === "approve") {
        await approve.mutateAsync({ name: target.name, note });
      } else {
        await reject.mutateAsync({ name: target.name, note });
      }
      onClose();
    } catch (err) {
      setError((err as Error)?.message ?? "Failed.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card className="w-full max-w-lg border-border shadow-lg">
        <CardContent className="space-y-4 p-6">
          <h2 className="font-display text-xl font-semibold">
            {target.mode === "approve" ? "Approve variance" : "Reject variance"} on {target.name}?
          </h2>
          <p className="text-sm text-muted-foreground">
            {target.mode === "approve"
              ? "Releases the shift. The variance is recorded on the shift document for the audit trail."
              : "Holds the shift for a re-count. The clerk gets the shift back in 'reconciling' state."}
          </p>
          <div className="space-y-1">
            <Label htmlFor="note">Note (recommended)</Label>
            <Input
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What did you find?"
              className="h-12 text-base"
            />
          </div>
          {error && (
            <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {error}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={busy} variant={target.mode === "reject" ? "destructive" : "default"}>
              {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
              {target.mode === "approve" ? "Approve" : "Reject"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
