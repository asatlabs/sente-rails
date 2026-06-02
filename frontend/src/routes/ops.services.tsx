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
// /ops/services — service catalogue admin.

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
  fetchOpsServices,
  fetchOpsWhoami,
  useOpsServices,
  useUpdateService,
  useOpsWhoami,
  type ServiceRow,
  type OpsWhoami,
} from "@/lib/ops";

export const Route = createFileRoute("/ops/services")({
  head: () => ({ meta: [{ title: "Services · Ops" }] }),
  loader: async () => {
    const [rows, who] = await Promise.all([
      fetchOpsServices({}).catch(() => [] as ServiceRow[]),
      fetchOpsWhoami().catch(() => null as OpsWhoami | null),
    ]);
    return { rows, who };
  },
  component: ServicesPage,
});

function ServicesPage() {
  const { rows: initialRows, who: initialWho } = Route.useLoaderData();
  const { data: who } = useOpsWhoami(initialWho ?? undefined);
  const canWrite = who?.authenticated && who.can_write;
  const { data: rows = initialRows, isLoading } = useOpsServices({}, initialRows);
  const [q, setQ] = useState("");
  const [editTarget, setEditTarget] = useState<ServiceRow | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (r) =>
        r.code.toLowerCase().includes(needle) ||
        r.service_name?.toLowerCase().includes(needle) ||
        r.mda.toLowerCase().includes(needle),
    );
  }, [rows, q]);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Services</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isLoading ? "Loading…" : `${filtered.length} of ${rows.length} services`}
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter…" className="h-9 w-72 pl-8" />
        </div>
      </header>

      <Card className="border-border shadow-none">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Code</th>
                  <th className="px-3 py-2 text-left font-semibold">MDA</th>
                  <th className="px-3 py-2 text-left font-semibold">Service</th>
                  <th className="px-3 py-2 text-left font-semibold">Family</th>
                  <th className="px-3 py-2 text-right font-semibold">Fee</th>
                  <th className="px-3 py-2 text-left font-semibold">EFRIS</th>
                  <th className="px-3 py-2 text-left font-semibold">Status</th>
                  <th className="px-3 py-2 text-right font-semibold">Edit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((s) => (
                  <tr key={s.name} className="hover:bg-surface-muted/60">
                    <td className="px-3 py-1.5 font-mono text-xs">{s.code}</td>
                    <td className="px-3 py-1.5 font-mono text-xs">{s.mda}</td>
                    <td className="px-3 py-1.5">{s.service_name}</td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">{s.service_family ?? "—"}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs">
                      {s.fee_basis === "Tiered"
                        ? "Tiered"
                        : `${s.fee_currency} ${s.fee_amount.toLocaleString()} · ${s.fee_basis}`}
                    </td>
                    <td className="px-3 py-1.5 text-xs">
                      {s.efris_taxable
                        ? `Yes · VAT ${s.vat_applicable ? `${s.vat_rate}%` : "—"}`
                        : "No"}
                    </td>
                    <td className="px-3 py-1.5">
                      <Badge
                        className={
                          s.status === "Active"
                            ? "border-0 bg-success/15 text-success"
                            : "border-0 bg-muted text-muted-foreground"
                        }
                      >
                        {s.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <Button size="sm" variant="ghost" disabled={!canWrite} onClick={() => setEditTarget(s)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {!isLoading && filtered.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">No matches.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {editTarget && <EditServiceDialog target={editTarget} onClose={() => setEditTarget(null)} />}
    </div>
  );
}

function EditServiceDialog({ target, onClose }: { target: ServiceRow; onClose: () => void }) {
  const [serviceName, setServiceName] = useState(target.service_name);
  const [sector, setSector] = useState(target.sector ?? "");
  const [serviceFamily, setServiceFamily] = useState(target.service_family ?? "");
  const [feeAmount, setFeeAmount] = useState(target.fee_amount.toString());
  const [feeCurrency, setFeeCurrency] = useState(target.fee_currency);
  const [feeBasis, setFeeBasis] = useState(target.fee_basis);
  const [efrisTaxable, setEfrisTaxable] = useState(!!target.efris_taxable);
  const [vatRate, setVatRate] = useState(target.vat_rate.toString());
  const [status, setStatus] = useState(target.status);
  const [error, setError] = useState<string | null>(null);
  const upd = useUpdateService();

  async function onSave() {
    setError(null);
    try {
      await upd.mutateAsync({
        name: target.name,
        patch: {
          service_name: serviceName,
          sector,
          service_family: serviceFamily,
          fee_amount: Number(feeAmount) || 0,
          fee_currency: feeCurrency,
          fee_basis: feeBasis,
          efris_taxable: efrisTaxable ? 1 : 0,
          vat_rate: Number(vatRate) || 0,
          status,
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
          <DialogTitle>Edit {target.code}</DialogTitle>
          <DialogDescription>
            {target.mda} · {target.name}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="col-span-2 space-y-1">
            <Label htmlFor="sn">Service name</Label>
            <Input id="sn" value={serviceName} onChange={(e) => setServiceName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Sector</Label>
            <Input value={sector} onChange={(e) => setSector(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Family</Label>
            <Input value={serviceFamily} onChange={(e) => setServiceFamily(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Fee amount</Label>
            <Input type="number" min={0} value={feeAmount} onChange={(e) => setFeeAmount(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Currency</Label>
            <Input value={feeCurrency} onChange={(e) => setFeeCurrency(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Fee basis</Label>
            <select value={feeBasis} onChange={(e) => setFeeBasis(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option>Flat</option>
              <option>Per-Day</option>
              <option>Per-Unit</option>
              <option>Tiered</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label>Status</Label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option>Active</option>
              <option>Suspended</option>
              <option>Draft</option>
            </select>
          </div>
          <div className="col-span-2 flex items-center gap-2 pt-2">
            <input id="efris" type="checkbox" checked={efrisTaxable} onChange={(e) => setEfrisTaxable(e.target.checked)} className="h-4 w-4" />
            <Label htmlFor="efris" className="cursor-pointer">EFRIS taxable</Label>
            {efrisTaxable && (
              <span className="ml-3 inline-flex items-center gap-2 text-xs">
                VAT rate %{" "}
                <Input type="number" value={vatRate} onChange={(e) => setVatRate(e.target.value)} className="h-7 w-20" />
              </span>
            )}
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
