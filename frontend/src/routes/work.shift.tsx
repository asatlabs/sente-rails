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
// /work/shift — the station home: open a shift, or run the active-shift
// dashboard (KPIs + quick actions + recent activity) and close it.

import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Banknote,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  Receipt,
  TriangleAlert,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StationReadiness } from "@/components/work/station-readiness";
import { ShiftReportDialog } from "@/components/work/shift-report-dialog";
import { TxnStatus } from "@/components/work/txn-status";
import {
  fetchWorkMdas,
  fetchMyShifts,
  fetchWorkWhoami,
  useWorkMdas,
  useWorkWhoami,
  useActiveShift,
  useMyShifts,
  useOpenShift,
  useCloseShift,
  useShiftReport,
  useWorkHistory,
  type Mda,
  type ShiftDoc,
  type WorkWhoami,
} from "@/lib/work";

export const Route = createFileRoute("/work/shift")({
  head: () => ({ meta: [{ title: "Shift · Work" }] }),
  loader: async () => {
    const [mdas, shifts, who] = await Promise.all([
      fetchWorkMdas().catch(() => [] as Mda[]),
      fetchMyShifts().catch(() => [] as ShiftDoc[]),
      fetchWorkWhoami().catch(() => null as WorkWhoami | null),
    ]);
    return { mdas, shifts, who };
  },
  component: ShiftPage,
});

function ShiftPage() {
  const { mdas: initialMdas, who: initialWho } = Route.useLoaderData();
  const { data: mdas = initialMdas } = useWorkMdas(initialMdas);
  const { data: who } = useWorkWhoami(initialWho ?? undefined);

  const assignedMda = who?.authenticated && who.clerk_mda ? who.clerk_mda : null;
  const isAdminMultiMda = !assignedMda && mdas.length !== 1;

  const [mda, setMda] = useState<string>(() => {
    if (assignedMda) return assignedMda;
    if (mdas.length === 1) return mdas[0].name;
    return localStorage.getItem("work.mda") ?? "";
  });

  useEffect(() => {
    if (assignedMda && mda !== assignedMda) setMda(assignedMda);
  }, [assignedMda, mda]);

  useEffect(() => {
    if (mda && isAdminMultiMda) localStorage.setItem("work.mda", mda);
  }, [mda, isAdminMultiMda]);

  const { data: shift, isLoading: shiftLoading } = useActiveShift(mda);

  if (!mda && !isAdminMultiMda) {
    return (
      <EmptyCard
        title="No MDA assigned"
        body="Your account isn't tied to an MDA yet. Ask Ops to set your operator MDA before you can open a shift."
      />
    );
  }

  return (
    <div className="space-y-5">
      {isAdminMultiMda && !shift && (
        <Card className="border-border shadow-sm">
          <CardContent className="p-4">
            <Label htmlFor="mda" className="text-xs uppercase tracking-wider text-muted-foreground">
              Counter MDA
            </Label>
            <select
              id="mda"
              value={mda}
              onChange={(e) => setMda(e.target.value)}
              className="mt-1.5 h-11 w-full rounded-md border border-input bg-background px-3 text-base"
            >
              <option value="">— pick the MDA you&apos;re working at —</option>
              {mdas.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.short_code} · {m.full_name}
                </option>
              ))}
            </select>
          </CardContent>
        </Card>
      )}

      {mda && (
        <>
          {shiftLoading ? (
            <p className="py-10 text-center text-muted-foreground">
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Checking for an active shift…
            </p>
          ) : shift ? (
            <ActiveShift shift={shift} />
          ) : (
            <OpenShift mda={mda} mdaLabel={mdas.find((m) => m.name === mda)?.full_name ?? mda} />
          )}
        </>
      )}

      <StationReadiness />
      <RecentShifts />
    </div>
  );
}

// ── Active shift dashboard ───────────────────────────────────────────────

function ActiveShift({ shift }: { shift: NonNullable<ReturnType<typeof useActiveShift>["data"]> }) {
  const [closing, setClosing] = useState(false);
  const [showX, setShowX] = useState(false);
  const { data: report } = useShiftReport(shift.name, "X", true);
  const { data: history = [] } = useWorkHistory(6);
  const cur = report?.currency ?? "UGX";
  const money = (n: number) => `${cur} ${Math.round(n).toLocaleString()}`;

  return (
    <>
      {/* Summary + actions */}
      <Card className="overflow-hidden border-success/30 shadow-sm">
        <div className="flex flex-col gap-3 bg-success/5 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-success/15 text-success">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div>
              <h2 className="font-display text-xl font-semibold">Shift open</h2>
              <p className="text-sm text-muted-foreground">
                {shift.mda} · {shift.counter_label || "no label"} · opened{" "}
                <span className="font-mono">
                  {shift.opened_at ? new Date(shift.opened_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                </span>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild className="h-11">
              <Link to="/work/assess">
                Go to counter <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" className="h-11" onClick={() => setShowX(true)}>
              <FileText className="mr-1.5 h-4 w-4" /> X-report
            </Button>
            <Button variant="outline" className="h-11" onClick={() => setClosing(true)}>
              Close shift
            </Button>
          </div>
        </div>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Collected today" value={money(report?.total_collected ?? 0)} />
        <Kpi label="Transactions" value={String(report?.assessment_count ?? 0)} />
        <Kpi label="Cash in drawer" value={money(report?.cash?.expected ?? shift.opening_cash ?? 0)} sub="expected" />
        <Kpi
          label="Corrections"
          value={String((report?.refunds?.count ?? 0) + (report?.waivers?.count ?? 0))}
          sub={`${report?.refunds?.count ?? 0} refunds · ${report?.waivers?.count ?? 0} waivers`}
        />
      </div>

      {/* Recent activity */}
      <Card className="border-border shadow-sm">
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <h3 className="font-display text-base font-semibold">Recent activity</h3>
            <Button asChild size="sm" variant="ghost">
              <Link to="/work/history">View all</Link>
            </Button>
          </div>
          {history.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              No transactions yet. Head to the counter to serve the first citizen.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {history.slice(0, 6).map((t) => (
                <li key={t.name} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{t.citizen_name}</p>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-mono">{t.name}</span>
                      {t.channel ? ` · ${t.channel}` : ""}
                      {t.created ? ` · ${new Date(t.created).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="font-mono text-sm font-semibold">{money(t.total_amount)}</span>
                    <TxnStatus status={t.status} paymentStatus={t.payment_status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {closing && <CloseShiftDialog shift={shift} onClose={() => setClosing(false)} />}
      <ShiftReportDialog shift={shift.name} kind="X" open={showX} onOpenChange={setShowX} />
    </>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="border-border shadow-none">
      <CardContent className="p-4">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-1 font-display text-2xl font-semibold">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ── Open shift ───────────────────────────────────────────────────────────

function OpenShift({ mda, mdaLabel }: { mda: string; mdaLabel: string }) {
  const [counterLabel, setCounterLabel] = useState("");
  const [openingCash, setOpeningCash] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const open = useOpenShift();

  async function onOpen() {
    setError(null);
    try {
      await open.mutateAsync({ mda, counter_label: counterLabel, opening_cash: Number(openingCash) || 0 });
      router.navigate({ to: "/work/assess" });
    } catch (err) {
      setError((err as Error)?.message ?? "Failed to open shift.");
    }
  }

  return (
    <Card className="border-border shadow-sm">
      <CardContent className="p-6">
        <div className="mb-1 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Banknote className="h-5 w-5" />
          </div>
          <Badge className="border-0 bg-surface-muted font-mono text-xs text-foreground">{mda}</Badge>
          <span className="text-sm text-muted-foreground">{mdaLabel}</span>
        </div>
        <h2 className="mt-3 font-display text-2xl font-semibold">Open a shift</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Count your opening cash float, then open. You&apos;ll be taken straight to the counter.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cl">Counter label <span className="text-muted-foreground">(optional)</span></Label>
            <Input id="cl" value={counterLabel} onChange={(e) => setCounterLabel(e.target.value)} placeholder="Counter 1" className="h-12 text-base" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="oc">Opening cash float</Label>
            <Input id="oc" type="number" min={0} value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} className="h-12 text-base font-mono" />
          </div>
        </div>

        {error && (
          <div className="mt-4 flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        <Button className="mt-5 h-14 w-full text-base" onClick={onOpen} disabled={open.isPending}>
          {open.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Opening…</> : <>Open shift <ArrowRight className="ml-2 h-4 w-4" /></>}
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Close shift ──────────────────────────────────────────────────────────

function CloseShiftDialog({
  shift,
  onClose,
}: {
  shift: NonNullable<ReturnType<typeof useActiveShift>["data"]>;
  onClose: () => void;
}) {
  const expected = shift.expected_total ?? 0;
  const [cash, setCash] = useState(String(expected));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const close = useCloseShift();
  const counted = Number(cash) || 0;
  const variance = counted - expected;

  async function onSubmit() {
    setError(null);
    try {
      await close.mutateAsync({ name: shift.name, cash_counted: counted, note });
      onClose();
    } catch (err) {
      setError((err as Error)?.message ?? "Failed.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card className="w-full max-w-lg border-border shadow-lg">
        <CardContent className="space-y-4 p-6">
          <h2 className="font-display text-xl font-semibold">Close shift {shift.name}</h2>
          <p className="text-sm text-muted-foreground">
            Count your cash drawer and enter the total. If it differs from expected, a supervisor is asked to
            approve the variance.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <KV label="Expected (from receipts)">
              <span className="font-mono">{expected.toLocaleString()}</span>
            </KV>
            <KV label="Variance (after counting)">
              <span className={`font-mono ${variance === 0 ? "" : "font-semibold text-warning-foreground"}`}>
                {variance.toLocaleString()}
              </span>
            </KV>
          </div>
          <div className="space-y-1">
            <Label htmlFor="cash">Cash counted</Label>
            <Input id="cash" type="number" min={0} value={cash} onChange={(e) => setCash(e.target.value)} className="h-12 text-base font-mono" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="note">Note (optional)</Label>
            <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything the supervisor should know?" className="h-12 text-base" />
          </div>
          {error && (
            <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {error}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={close.isPending}>Cancel</Button>
            <Button onClick={onSubmit} disabled={close.isPending}>
              {close.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
              Close shift
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Recent shifts (Z-reports) ────────────────────────────────────────────

function RecentShifts() {
  const { shifts: initialShifts } = Route.useLoaderData();
  const { data: shifts = initialShifts } = useMyShifts(initialShifts);
  const [reportShift, setReportShift] = useState<string | null>(null);
  const closed = shifts.filter((s) => s.status === "Closed");
  if (closed.length === 0) return null;
  return (
    <Card className="border-border shadow-sm">
      <CardContent className="p-0">
        <div className="border-b border-border px-5 py-3">
          <h3 className="font-display text-base font-semibold">Recent shifts</h3>
        </div>
        <ul className="divide-y divide-border">
          {closed.slice(0, 6).map((s) => (
            <li key={s.name} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
              <div>
                <p className="font-mono text-xs">{s.name}</p>
                <p className="text-xs text-muted-foreground">
                  {s.mda} · opened {s.opened_at ? new Date(s.opened_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setReportShift(s.name)}>
                  <Receipt className="mr-1 h-3.5 w-3.5" /> Z-report
                </Button>
                <Badge className="border-0 bg-muted text-muted-foreground">{s.status}</Badge>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
      <ShiftReportDialog shift={reportShift} kind="Z" open={!!reportShift} onOpenChange={(o) => { if (!o) setReportShift(null); }} />
    </Card>
  );
}

function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-mono text-sm">{children}</p>
    </div>
  );
}

function EmptyCard({ title, body }: { title: string; body: string }) {
  return (
    <Card className="border-warning/40 bg-warning/5 shadow-sm">
      <CardContent className="p-6 text-center">
        <Clock className="mx-auto h-6 w-6 text-warning-foreground" />
        <p className="mt-3 font-display text-lg font-semibold">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      </CardContent>
    </Card>
  );
}
