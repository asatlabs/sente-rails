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
// /ops/mdas — MDA catalogue admin. Read-only list with inline edit dialog
// for the writable subset (full_name, mode, status, sector, treasury account,
// integration status, target endpoint count).

import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Loader2, Pencil, Search, TriangleAlert } from "lucide-react";
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
  fetchOpsMdas,
  fetchOpsWhoami,
  useOpsMdas,
  useUpdateMda,
  useOpsWhoami,
  type MdaRow,
  type OpsWhoami,
} from "@/lib/ops";

export const Route = createFileRoute("/ops/mdas")({
  head: () => ({ meta: [{ title: "MDAs · Ops" }] }),
  loader: async () => {
    const [mdas, who] = await Promise.all([
      fetchOpsMdas().catch(() => [] as MdaRow[]),
      fetchOpsWhoami().catch(() => null as OpsWhoami | null),
    ]);
    return { mdas, who };
  },
  component: MdasPage,
});

const INTEGRATION_STATUSES = ["Live", "Sandbox", "Planned", "Inquiry"];
const STATUS_PILLS: Record<string, string> = {
  Active: "bg-success/15 text-success border-0",
  Onboarding: "bg-info/15 text-info border-0",
  Suspended: "bg-destructive/15 text-destructive border-0",
};

function MdasPage() {
  const { mdas: initialMdas, who: initialWho } = Route.useLoaderData();
  const { data: who } = useOpsWhoami(initialWho ?? undefined);
  const canWrite = who?.authenticated && who.can_write;
  const { data: mdas = initialMdas, isLoading } = useOpsMdas(initialMdas);
  const [q, setQ] = useState("");
  const [editTarget, setEditTarget] = useState<MdaRow | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return mdas;
    return mdas.filter(
      (m) =>
        m.short_code.toLowerCase().includes(needle) ||
        m.full_name?.toLowerCase().includes(needle) ||
        (m.sector ?? "").toLowerCase().includes(needle),
    );
  }, [mdas, q]);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">MDAs</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isLoading ? "Loading…" : `${filtered.length} of ${mdas.length} agencies`}
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter by code, name, sector…"
            className="h-9 w-72 pl-8"
          />
        </div>
      </header>

      <Card className="border-border shadow-none">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Code</th>
                  <th className="px-3 py-2 text-left font-semibold">Name</th>
                  <th className="px-3 py-2 text-left font-semibold">Type</th>
                  <th className="px-3 py-2 text-left font-semibold">Mode</th>
                  <th className="px-3 py-2 text-left font-semibold">Sector</th>
                  <th className="px-3 py-2 text-right font-semibold">Endpts</th>
                  <th className="px-3 py-2 text-left font-semibold">Integration</th>
                  <th className="px-3 py-2 text-left font-semibold">Status</th>
                  <th className="px-3 py-2 text-right font-semibold">Edit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading && (
                  <tr><td colSpan={9} className="px-4 py-6 text-center text-muted-foreground">Loading…</td></tr>
                )}
                {!isLoading && filtered.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-6 text-center text-muted-foreground">No matches.</td></tr>
                )}
                {filtered.map((m) => (
                  <tr key={m.name} className="hover:bg-surface-muted/60">
                    <td className="px-3 py-1.5 font-mono text-xs">{m.short_code}</td>
                    <td className="px-3 py-1.5">{m.full_name}</td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">{m.mda_type}</td>
                    <td className="px-3 py-1.5 font-mono text-xs">{m.mode}</td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">{m.sector ?? "—"}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs">
                      {m.endpoint_count}
                      {m.endpoint_count !== m.display_endpoint_count && (
                        <span className="ml-1 text-[10px] text-muted-foreground">
                          /{m.display_endpoint_count}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-xs">{m.integration_status}</td>
                    <td className="px-3 py-1.5">
                      <Badge className={STATUS_PILLS[m.status] ?? "border-0 bg-muted text-muted-foreground"}>
                        {m.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!canWrite}
                        onClick={() => setEditTarget(m)}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {editTarget && (
        <EditMdaDialog target={editTarget} onClose={() => setEditTarget(null)} />
      )}
    </div>
  );
}

function EditMdaDialog({ target, onClose }: { target: MdaRow; onClose: () => void }) {
  const [fullName, setFullName] = useState(target.full_name);
  const [mode, setMode] = useState(target.mode);
  const [status, setStatus] = useState(target.status);
  const [sector, setSector] = useState(target.sector ?? "");
  const [treasuryAccount, setTreasuryAccount] = useState(target.treasury_account ?? "");
  const [integrationStatus, setIntegrationStatus] = useState(target.integration_status);
  const [targetEndpointCount, setTargetEndpointCount] = useState(target.target_endpoint_count.toString());
  const [error, setError] = useState<string | null>(null);
  const upd = useUpdateMda();

  async function onSave() {
    setError(null);
    try {
      await upd.mutateAsync({
        name: target.name,
        patch: {
          full_name: fullName,
          mode,
          status,
          sector,
          treasury_account: treasuryAccount,
          integration_status: integrationStatus,
          target_endpoint_count: Number(targetEndpointCount) || 0,
        },
      });
      onClose();
    } catch (err) {
      setError((err as Error)?.message ?? "Save failed.");
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !upd.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {target.short_code}</DialogTitle>
          <DialogDescription>
            Operator-facing fields. Endpoint counts are computed automatically
            from the Service catalogue and not editable here.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="col-span-2 space-y-1">
            <Label htmlFor="full_name">Full name</Label>
            <Input id="full_name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="mode">Mode</Label>
            <select
              id="mode"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="A">A — Direct collection</option>
              <option value="B">B — Push integration (e.g. URA-EFRIS)</option>
              <option value="C">C — Read-only (oversight)</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="status">Status</Label>
            <select
              id="status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option>Active</option>
              <option>Onboarding</option>
              <option>Suspended</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="sector">Sector</Label>
            <Input id="sector" value={sector} onChange={(e) => setSector(e.target.value)} placeholder="Local Government, Revenue, ..." />
          </div>
          <div className="space-y-1">
            <Label htmlFor="treasury">Treasury account</Label>
            <Input id="treasury" value={treasuryAccount} onChange={(e) => setTreasuryAccount(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="integ">Integration status</Label>
            <select
              id="integ"
              value={integrationStatus}
              onChange={(e) => setIntegrationStatus(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {INTEGRATION_STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="target">Target endpoints</Label>
            <Input id="target" type="number" min={0} value={targetEndpointCount} onChange={(e) => setTargetEndpointCount(e.target.value)} />
          </div>
        </div>

        {error && (
          <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={upd.isPending}>Cancel</Button>
          <Button onClick={onSave} disabled={upd.isPending}>
            {upd.isPending ? (<><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Saving…</>) : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
