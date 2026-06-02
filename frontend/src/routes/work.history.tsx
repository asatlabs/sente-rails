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
// /work/history — the clerk's recent transactions: who was served, what they
// paid, the outcome, and a one-tap receipt reprint.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, Loader2, Printer, Receipt, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TxnStatus } from "@/components/work/txn-status";
import { downloadReceiptPdf, printReceipt } from "@/lib/printer";
import { fetchWorkHistory, useWorkHistory, type WorkTxn } from "@/lib/work";

export const Route = createFileRoute("/work/history")({
  head: () => ({ meta: [{ title: "History · Work" }] }),
  loader: () => fetchWorkHistory(50).catch(() => [] as WorkTxn[]),
  component: HistoryPage,
});

type Filter = "all" | "paid" | "awaiting" | "voided";

function HistoryPage() {
  const initial = Route.useLoaderData();
  const { data: txns = initial, isFetching, refetch } = useWorkHistory(50, initial);
  const [filter, setFilter] = useState<Filter>("all");
  const [printing, setPrinting] = useState<string | null>(null);
  const [printMsg, setPrintMsg] = useState<string | null>(null);

  const rows = useMemo(() => txns.filter((t) => matches(t, filter)), [txns, filter]);

  async function reprint(t: WorkTxn) {
    if (!t.intent) return;
    setPrinting(t.name);
    setPrintMsg(null);
    try {
      await printReceipt(t.intent, { reprint: true });
      setPrintMsg(`Reprinted ${t.name}.`);
    } catch (e) {
      setPrintMsg((e as Error)?.message ?? "Reprint failed.");
    } finally {
      setPrinting(null);
    }
  }

  const counts = {
    all: txns.length,
    paid: txns.filter((t) => matches(t, "paid")).length,
    awaiting: txns.filter((t) => matches(t, "awaiting")).length,
    voided: txns.filter((t) => matches(t, "voided")).length,
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {(["all", "paid", "awaiting", "voided"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1.5 text-sm capitalize transition-colors ${
                filter === f ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {f} <span className="text-xs opacity-60">{counts[f]}</span>
            </button>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {printMsg && <p className="text-xs text-muted-foreground">{printMsg}</p>}

      <Card className="border-border shadow-sm">
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <Receipt className="mx-auto h-7 w-7 text-muted-foreground/50" />
              <p className="mt-3 text-sm text-muted-foreground">
                {txns.length === 0 ? "No transactions yet." : "Nothing matches this filter."}
              </p>
              {txns.length === 0 && (
                <Button asChild size="sm" className="mt-4">
                  <Link to="/work/assess">Go to counter</Link>
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-muted text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-5 py-2.5 text-left font-semibold">Time</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Citizen</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Amount</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Channel</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Status</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Fiscal</th>
                    <th className="px-5 py-2.5 text-right font-semibold"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((t) => (
                    <tr key={t.name} className="hover:bg-surface-muted/40">
                      <td className="whitespace-nowrap px-5 py-3 text-xs text-muted-foreground">
                        {t.created ? new Date(t.created).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : "—"}
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-medium">{t.citizen_name}</p>
                        <p className="font-mono text-[11px] text-muted-foreground">{t.name}</p>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-mono">
                        {Math.round(t.total_amount).toLocaleString()}
                        {t.discount_amount > 0 && (
                          <span className="ml-1 text-[10px] text-warning-foreground">waiver</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs">{t.channel ?? "—"}</td>
                      <td className="px-3 py-3"><TxnStatus status={t.status} paymentStatus={t.payment_status} /></td>
                      <td className="px-3 py-3">
                        {t.fdn ? (
                          <Badge className="border-0 bg-success/10 font-mono text-[10px] text-success">FDN</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {t.intent && (t.status === "Paid" || t.payment_status === "Confirmed") ? (
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => reprint(t)} disabled={printing === t.name}>
                              {printing === t.name ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Printer className="mr-1 h-3.5 w-3.5" /> Reprint</>}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => t.intent && downloadReceiptPdf(t.intent)} title="Download PDF">
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function matches(t: WorkTxn, f: Filter): boolean {
  if (f === "all") return true;
  if (f === "paid") return t.status === "Paid" || t.payment_status === "Confirmed";
  if (f === "awaiting") return t.status === "Assessed" && t.payment_status !== "Confirmed";
  if (f === "voided") return t.status === "Cancelled";
  return true;
}
