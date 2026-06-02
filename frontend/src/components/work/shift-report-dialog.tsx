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
//
// ShiftReportDialog — on-screen X / Z report with a Print button.
//
// X = mid-shift snapshot (live, doesn't close). Z = end-of-shift close-out
// (settled, with counted cash + variance). Renders the same numbers the
// thermal tape prints, so the report is usable with or without a printer.

import { useState } from "react";
import { Loader2, Printer } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useShiftReport, type ShiftReport } from "@/lib/work";
import { printShiftReport } from "@/lib/printer";

export function ShiftReportDialog({
  shift,
  kind,
  open,
  onOpenChange,
}: {
  shift: string | null;
  kind: "X" | "Z";
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: report, isLoading, error } = useShiftReport(shift ?? undefined, kind, open);
  const [printState, setPrintState] = useState<"idle" | "printing" | "done" | "error">("idle");
  const [printMsg, setPrintMsg] = useState<string | null>(null);

  async function onPrint() {
    if (!shift) return;
    setPrintState("printing");
    setPrintMsg(null);
    try {
      await printShiftReport(shift, kind);
      setPrintState("done");
    } catch (e) {
      setPrintState("error");
      setPrintMsg((e as Error)?.message ?? "Printing failed.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="min-w-0 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{kind === "Z" ? "Z-report — shift close-out" : "X-report — mid-shift snapshot"}</DialogTitle>
          <DialogDescription>
            {kind === "Z"
              ? "The settled end-of-shift tape."
              : "A live snapshot of the drawer — this does not close the shift."}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading…
          </p>
        ) : error || !report ? (
          <p className="py-6 text-center text-sm text-destructive">Couldn&apos;t load the report.</p>
        ) : (
          <ReportBody r={report} />
        )}

        {printMsg && <p className="text-xs text-destructive">{printMsg}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={() => void onPrint()} disabled={!report || printState === "printing"}>
            {printState === "printing" ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Printing…</>
            ) : (
              <><Printer className="mr-2 h-4 w-4" /> {printState === "done" ? "Printed · reprint" : "Print"}</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReportBody({ r }: { r: ShiftReport }) {
  const money = (n: number) => `${r.currency} ${n.toLocaleString()}`;
  return (
    <div className="space-y-3 text-sm">
      <div>
        <p className="font-display text-base font-semibold">{r.mda_name}</p>
        <p className="font-mono text-xs text-muted-foreground">
          {r.shift} · {r.status}
        </p>
      </div>

      <Section title="Collections by channel">
        {r.by_channel
          .filter((c) => c.total !== 0 || r.kind === "Z")
          .map((c) => <Row key={c.channel} label={c.channel} value={money(c.total)} />)}
        <div className="mt-1 border-t border-border pt-1">
          <Row label="Total collected" value={money(r.total_collected)} strong />
        </div>
      </Section>

      <Section title="Cash drawer">
        <Row label="Opening float" value={money(r.opening_float)} />
        <Row label="Cash collected" value={money(r.cash_collected)} />
        <Row label="Cash expected" value={money(r.cash.expected)} strong />
        {r.kind === "Z" && r.cash.counted != null && <Row label="Cash counted" value={money(r.cash.counted)} />}
        {r.kind === "Z" && r.cash.variance != null && <Row label="Variance" value={money(r.cash.variance)} strong />}
        {r.kind === "Z" && r.cash.variance_reason && (
          <p className="text-xs text-muted-foreground">Reason: {r.cash.variance_reason}</p>
        )}
      </Section>

      {r.by_service.length > 0 && (
        <Section title="By service">
          {r.by_service.map((s) => (
            <Row key={s.service} label={`${s.service_name} ×${s.count}`} value={money(s.total)} />
          ))}
        </Section>
      )}

      {(r.refunds.count > 0 || r.waivers.count > 0) && (
        <div className="space-y-1 rounded-md border border-warning/30 bg-warning/5 p-3">
          {r.refunds.count > 0 && <Row label={`Refunds (${r.refunds.count})`} value={`−${money(r.refunds.total)}`} />}
          {r.waivers.count > 0 && <Row label={`Waivers (${r.waivers.count})`} value={`−${money(r.waivers.total)}`} />}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {r.assessment_count} assessments · generated {r.generated_at}
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1 rounded-md border border-border p-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "font-semibold" : ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
