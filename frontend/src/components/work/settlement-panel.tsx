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
// SettlementPanel — "where the money went". Shows, for a confirmed payment,
// how it was split per MDA and which treasury collection account each share
// settled to. The point the rail exists to make: Sente Rails never holds the
// funds (PFMA §43) — the aggregator settles each MDA's share directly.

import { CheckCircle2, CornerDownRight, Landmark, Loader2, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { usePaymentBreakdown } from "@/lib/work";

export function SettlementPanel({ intent, enabled = true }: { intent: string | null; enabled?: boolean }) {
  const { data, isLoading, error } = usePaymentBreakdown(intent ?? undefined, enabled && !!intent);

  return (
    <Card className="border-border bg-card shadow-sm">
      <CardContent className="p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display text-lg font-semibold">Where the money went</h3>
            <p className="text-xs text-muted-foreground">Settlement to treasury accounts</p>
          </div>
          <Landmark className="h-5 w-5 text-muted-foreground" />
        </div>

        {isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading settlement…
          </p>
        ) : error || !data ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Couldn&apos;t load the breakdown.</p>
        ) : (
          <Body data={data} />
        )}
      </CardContent>
    </Card>
  );
}

function Body({ data }: { data: NonNullable<ReturnType<typeof usePaymentBreakdown>["data"]> }) {
  const money = (n: number) => `${data.currency} ${Math.round(n).toLocaleString()}`;
  const multi = data.splits.length > 1;

  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center justify-between rounded-md bg-surface-muted px-3 py-2 text-sm">
        <span className="text-muted-foreground">
          Paid by <span className="font-medium text-foreground">{data.channel}</span>
        </span>
        <span className="font-mono text-base font-semibold">{money(data.amount)}</span>
      </div>

      <ul className="space-y-2.5">
        {data.splits.map((s) => (
          <li key={s.mda} className="rounded-lg border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <Badge className="border-0 bg-primary/10 font-mono text-[11px] text-primary">{s.mda_code}</Badge>
                <span className="truncate text-sm font-medium">{s.mda_name}</span>
              </div>
              <span className="shrink-0 font-mono text-sm font-semibold">{money(s.amount)}</span>
            </div>

            <div className="mt-1.5 flex items-start gap-1.5 text-xs text-muted-foreground">
              <CornerDownRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0">
                <span className="block">
                  {s.bank ? <span className="font-medium text-foreground">{s.bank}</span> : null}
                  {s.account_name ? <span> · {s.account_name}</span> : null}
                </span>
                <span className="font-mono">{s.destination_account}</span>
                <span className="text-muted-foreground/60"> · {s.account_type} a/c</span>
              </span>
            </div>

            <div className="mt-1.5 flex items-center justify-between text-[11px]">
              {s.settled ? (
                <span className="inline-flex items-center gap-1 text-success">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Settled directly
                </span>
              ) : (
                <span className="text-muted-foreground">Pending settlement</span>
              )}
              {multi && <span className="text-muted-foreground">{s.share_pct}% of total</span>}
            </div>
            {s.txn_id && (
              <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground/70">ref {s.txn_id}</p>
            )}
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
        <span className="font-medium">Settled to treasury</span>
        <span className="font-mono text-base font-semibold text-success">{money(data.settled_total)}</span>
      </div>

      <div className="flex gap-2 rounded-md border border-info/30 bg-info/5 p-3 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-info" />
        <span>
          Sente Rails never holds public funds. The aggregator settles each MDA&apos;s share{" "}
          <span className="font-medium text-foreground">directly</span> into its own collection account
          (PFMA §43) — the rail only records the proof.
        </span>
      </div>
    </div>
  );
}
