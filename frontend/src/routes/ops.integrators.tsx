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
// /ops/integrators — list + drill-in. Suspend/reactivate inline.

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, Search, ShieldAlert, ShieldCheck, TriangleAlert, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  fetchOpsIntegrators,
  fetchOpsWhoami,
  useOpsIntegrators,
  useOpsIntegrator,
  useSuspendIntegrator,
  useReactivateIntegrator,
  useOpsWhoami,
  type IntegratorRow,
  type OpsWhoami,
} from "@/lib/ops";

export const Route = createFileRoute("/ops/integrators")({
  head: () => ({ meta: [{ title: "Integrators · Ops" }] }),
  loader: async () => {
    const [rows, who] = await Promise.all([
      fetchOpsIntegrators({}).catch(() => [] as IntegratorRow[]),
      fetchOpsWhoami().catch(() => null as OpsWhoami | null),
    ]);
    return { rows, who };
  },
  component: IntegratorsPage,
});

const STATUS_PILLS: Record<string, string> = {
  Active: "bg-success/15 text-success border-0",
  PendingEmail: "bg-warning/15 text-warning-foreground border-0",
  Suspended: "bg-destructive/15 text-destructive border-0",
};

function IntegratorsPage() {
  const { rows: initialRows, who: initialWho } = Route.useLoaderData();
  const { data: who } = useOpsWhoami(initialWho ?? undefined);
  const canWrite = who?.authenticated && who.can_write;
  const [status, setStatus] = useState<string>("");
  const [q, setQ] = useState("");
  const [drillTarget, setDrillTarget] = useState<string | null>(null);

  const filters = { status: status || undefined, q: q || undefined };
  const isBaseQuery = !filters.status && !filters.q;
  const { data: rows = initialRows, isLoading } = useOpsIntegrators(
    filters,
    isBaseQuery ? initialRows : undefined,
  );

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Integrators</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isLoading ? "Loading…" : `${rows.length} integrators${status ? ` · ${status}` : ""}${q ? ` · "${q}"` : ""}`}
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="email, code, display name…" className="h-9 w-72 pl-8" />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Any status</option>
            <option>Active</option>
            <option>PendingEmail</option>
            <option>Suspended</option>
          </select>
        </div>
      </header>

      <Card className="border-border shadow-none">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Code</th>
                  <th className="px-3 py-2 text-left font-semibold">Display name</th>
                  <th className="px-3 py-2 text-left font-semibold">Email</th>
                  <th className="px-3 py-2 text-left font-semibold">Tier</th>
                  <th className="px-3 py-2 text-left font-semibold">Signup</th>
                  <th className="px-3 py-2 text-left font-semibold">Status</th>
                  <th className="px-3 py-2 text-left font-semibold">Verified</th>
                  <th className="px-3 py-2 text-right font-semibold">Last login</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {!isLoading && rows.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">No matches.</td></tr>
                )}
                {rows.map((r: IntegratorRow) => (
                  <tr
                    key={r.name}
                    className="cursor-pointer hover:bg-surface-muted/60"
                    onClick={() => setDrillTarget(r.name)}
                  >
                    <td className="px-3 py-1.5 font-mono text-xs">{r.name}</td>
                    <td className="px-3 py-1.5">{r.display_name}</td>
                    <td className="px-3 py-1.5 text-xs">{r.contact_email}</td>
                    <td className="px-3 py-1.5 text-xs">{r.tier} · {r.pricing_tier}</td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">{r.signup_source ?? "—"}</td>
                    <td className="px-3 py-1.5">
                      <Badge className={STATUS_PILLS[r.status] ?? "border-0 bg-muted text-muted-foreground"}>
                        {r.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-1.5 text-xs">
                      {r.email_verified ? (
                        <span className="inline-flex items-center gap-1 text-success">
                          <ShieldCheck className="h-3 w-3" /> verified
                        </span>
                      ) : (
                        <span className="text-warning-foreground">unverified</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-[11px] text-muted-foreground">
                      {r.last_login_at ? new Date(r.last_login_at).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {drillTarget && (
        <IntegratorDrillDialog
          name={drillTarget}
          canWrite={!!canWrite}
          onClose={() => setDrillTarget(null)}
        />
      )}
    </div>
  );
}

function IntegratorDrillDialog({
  name,
  canWrite,
  onClose,
}: {
  name: string;
  canWrite: boolean;
  onClose: () => void;
}) {
  const { data: doc, isLoading } = useOpsIntegrator(name);
  const [actionMode, setActionMode] = useState<"suspend" | "reactivate" | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const suspend = useSuspendIntegrator();
  const reactivate = useReactivateIntegrator();
  const acting = suspend.isPending || reactivate.isPending;

  async function onAction() {
    setError(null);
    if (!reason.trim()) {
      setError("Reason is required.");
      return;
    }
    try {
      if (actionMode === "suspend") {
        await suspend.mutateAsync({ name, reason });
      } else if (actionMode === "reactivate") {
        await reactivate.mutateAsync({ name, reason });
      }
      setActionMode(null);
      setReason("");
    } catch (err) {
      setError((err as Error)?.message ?? "Failed.");
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !acting && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {name}
            {doc?.status && (
              <Badge className={STATUS_PILLS[doc.status] ?? "border-0 bg-muted text-muted-foreground"}>
                {doc.status}
              </Badge>
            )}
          </DialogTitle>
          {doc && <DialogDescription>{doc.display_name} · {doc.contact_email}</DialogDescription>}
        </DialogHeader>

        {isLoading || !doc ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-4 text-sm">
            <div className="grid gap-3 sm:grid-cols-3">
              <KV label="Type">{doc.type}</KV>
              <KV label="Tier">{doc.tier} · {doc.pricing_tier}</KV>
              <KV label="Signup source">{doc.signup_source ?? "—"}</KV>
              <KV label="MoU status">{doc.mou_status}</KV>
              <KV label="KYC status">{doc.kyc_status}</KV>
              <KV label="Email verified">{doc.email_verified ? "yes" : "no"}</KV>
              <KV label="Keys (active / total)">
                <span className="font-mono">{doc.keys.active} / {doc.keys.total}</span>
              </KV>
              <KV label="Requests last 7d">
                <span className="font-mono">{doc.requests_last_7d.toLocaleString()}</span>
              </KV>
              <KV label="Last login">{doc.last_login_at ? new Date(doc.last_login_at).toLocaleString() : "—"}</KV>
              <KV label="Webhook">
                {doc.webhook_endpoint ? <code className="break-all font-mono text-xs">{doc.webhook_endpoint}</code> : "—"}
              </KV>
              <KV label="IP allowlist">{doc.ip_allowlist ?? "—"}</KV>
              <KV label="ToS">{doc.tos_accepted_version ?? "—"}</KV>
            </div>

            {doc.notes && (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Notes
                </p>
                <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-surface-muted p-3 text-xs">
                  {doc.notes}
                </pre>
              </div>
            )}

            {actionMode ? (
              <div className="space-y-3 rounded-md border border-warning/40 bg-warning/5 p-3">
                <p className="text-sm font-medium">
                  {actionMode === "suspend"
                    ? "Suspend this integrator? All keys will stop authenticating immediately."
                    : "Reactivate this integrator? Their existing keys will start working again."}
                </p>
                <div className="space-y-1">
                  <Label htmlFor="reason">Reason (required)</Label>
                  <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={280} />
                </div>
                {error && (
                  <div className="flex gap-2 text-xs text-destructive">
                    <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => { setActionMode(null); setReason(""); }} disabled={acting}>
                    <X className="mr-1 h-3 w-3" /> Cancel
                  </Button>
                  <Button
                    size="sm"
                    variant={actionMode === "suspend" ? "destructive" : "default"}
                    onClick={onAction}
                    disabled={acting || !reason.trim()}
                  >
                    {acting ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                    {actionMode === "suspend" ? "Suspend integrator" : "Reactivate integrator"}
                  </Button>
                </div>
              </div>
            ) : (
              canWrite && (
                <div className="flex justify-end gap-2 border-t border-border pt-3">
                  {doc.status === "Active" && (
                    <Button size="sm" variant="outline" className="text-destructive" onClick={() => setActionMode("suspend")}>
                      <ShieldAlert className="mr-1 h-3.5 w-3.5" /> Suspend
                    </Button>
                  )}
                  {doc.status === "Suspended" && (
                    <Button size="sm" onClick={() => setActionMode("reactivate")}>
                      <ShieldCheck className="mr-1 h-3.5 w-3.5" /> Reactivate
                    </Button>
                  )}
                </div>
              )
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={acting}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5">{children}</p>
    </div>
  );
}
