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
// /ops/keys — operator key admin: search across all integrators + force-revoke.

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, Search, ShieldX, TriangleAlert } from "lucide-react";
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
  fetchOpsKeys,
  fetchOpsWhoami,
  useOpsKeys,
  useForceRevokeKey,
  useOpsWhoami,
  type OpsKeyRow,
  type OpsWhoami,
} from "@/lib/ops";

export const Route = createFileRoute("/ops/keys")({
  head: () => ({ meta: [{ title: "Keys · Ops" }] }),
  loader: async () => {
    const [rows, who] = await Promise.all([
      fetchOpsKeys({}).catch(() => [] as OpsKeyRow[]),
      fetchOpsWhoami().catch(() => null as OpsWhoami | null),
    ]);
    return { rows, who };
  },
  component: KeysPage,
});

const STATUS_PILLS: Record<string, string> = {
  active: "bg-success/15 text-success border-0",
  rolling: "bg-info/15 text-info border-0",
  revoked: "bg-destructive/15 text-destructive border-0",
  expired: "bg-muted text-muted-foreground border-0",
};

function KeysPage() {
  const { rows: initialRows, who: initialWho } = Route.useLoaderData();
  const { data: who } = useOpsWhoami(initialWho ?? undefined);
  const canWrite = who?.authenticated && who.can_write;
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [revokeTarget, setRevokeTarget] = useState<OpsKeyRow | null>(null);
  const filters = { status: status || undefined, q: q || undefined };
  const isBaseQuery = !filters.status && !filters.q;
  const { data: rows = initialRows, isLoading } = useOpsKeys(
    filters,
    isBaseQuery ? initialRows : undefined,
  );

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Keys</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isLoading ? "Loading…" : `${rows.length} keys`}
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="last4, name, description…" className="h-9 w-72 pl-8" />
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
            <option value="">Any status</option>
            <option>active</option>
            <option>rolling</option>
            <option>revoked</option>
            <option>expired</option>
          </select>
        </div>
      </header>

      <Card className="border-border shadow-none">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Name</th>
                  <th className="px-3 py-2 text-left font-semibold">Integrator</th>
                  <th className="px-3 py-2 text-left font-semibold">Prefix · last4</th>
                  <th className="px-3 py-2 text-left font-semibold">Env</th>
                  <th className="px-3 py-2 text-left font-semibold">Status</th>
                  <th className="px-3 py-2 text-right font-semibold">Calls</th>
                  <th className="px-3 py-2 text-right font-semibold">Last used</th>
                  <th className="px-3 py-2 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((k) => (
                  <tr key={k.name} className="hover:bg-surface-muted/60">
                    <td className="px-3 py-1.5 font-mono text-xs">{k.name}</td>
                    <td className="px-3 py-1.5 font-mono text-xs">{k.integrator}</td>
                    <td className="px-3 py-1.5 font-mono text-xs">
                      {k.prefix}_***{k.last4}
                    </td>
                    <td className="px-3 py-1.5 text-xs">{k.environment}</td>
                    <td className="px-3 py-1.5">
                      <Badge className={STATUS_PILLS[k.status] ?? "border-0 bg-muted text-muted-foreground"}>
                        {k.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs">{k.usage_count.toLocaleString()}</td>
                    <td className="px-3 py-1.5 text-right text-[11px] font-mono text-muted-foreground">
                      {k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {(k.status === "active" || k.status === "rolling") && (
                        <Button size="sm" variant="ghost" className="text-destructive" disabled={!canWrite} onClick={() => setRevokeTarget(k)}>
                          <ShieldX className="h-3 w-3" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {!isLoading && rows.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">No keys match.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {revokeTarget && (
        <ForceRevokeDialog target={revokeTarget} onClose={() => setRevokeTarget(null)} />
      )}
    </div>
  );
}

function ForceRevokeDialog({ target, onClose }: { target: OpsKeyRow; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const revoke = useForceRevokeKey();

  async function onSubmit() {
    setError(null);
    if (!reason.trim()) {
      setError("Reason is required.");
      return;
    }
    try {
      await revoke.mutateAsync({ name: target.name, reason });
      onClose();
    } catch (err) {
      setError((err as Error)?.message ?? "Failed.");
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !revoke.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Force-revoke {target.name}?</DialogTitle>
          <DialogDescription>
            Integrator <code className="font-mono">{target.integrator}</code> · {target.prefix}_***{target.last4}.
            Revoke is immediate and permanent — the integrator&apos;s application starts getting 401s.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <Label htmlFor="reason">Reason (audit-logged)</Label>
          <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={280} />
        </div>
        {error && (
          <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={revoke.isPending}>Cancel</Button>
          <Button variant="destructive" onClick={onSubmit} disabled={revoke.isPending || !reason.trim()}>
            {revoke.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
            Revoke
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
