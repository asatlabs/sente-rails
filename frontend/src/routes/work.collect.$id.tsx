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
// /work/collect/<id> — payment flow for an assessed assessment.

import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  CheckCircle2,
  Download,
  Loader2,
  Printer,
  RotateCcw,
  TriangleAlert,
  Wallet,
  XCircle,
} from "lucide-react";
import { printReceipt, downloadReceiptPdf } from "@/lib/printer";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CorrectionDialog } from "@/components/work/correction-dialog";
import { SettlementPanel } from "@/components/work/settlement-panel";
import {
  fetchAssessment,
  useAssessment,
  useCreatePaymentIntent,
  useInitiatePayment,
  useConfirmPayment,
  usePaymentLiveStatus,
  useRefundPayment,
  useVoidAssessment,
  useApplyDiscount,
  type Assessment,
} from "@/lib/work";

export const Route = createFileRoute("/work/collect/$id")({
  head: () => ({ meta: [{ title: "Collect · Work" }] }),
  loader: ({ params }) =>
    fetchAssessment(params.id).catch(() => null as Assessment | null),
  component: CollectPage,
});

// `key` is the wire value sent to /v1/work/payment-intents and MUST match the
// Payment Intent.channel enum on the doctype (MTN MoMo · Airtel Money · Card ·
// Bank Transfer · Pesapal · Cash · Voucher). Drift breaks intent creation.
const CHANNELS = [
  { key: "Cash", label: "Cash", desc: "Counter cash payment" },
  { key: "MTN MoMo", label: "MTN MoMo", desc: "Mobile money push" },
  { key: "Airtel Money", label: "Airtel Money", desc: "Mobile money push" },
  { key: "Pesapal", label: "Pesapal", desc: "Hosted checkout — card / bank / mobile money" },
];

const MOBILE_MONEY_CHANNELS = new Set(["MTN MoMo", "Airtel Money"]);

// MTN MoMo sandbox publishes deterministic test MSISDNs. Default to the
// auto-approve one. Others: 46733123451 delayed-approve · 46733123452 fail ·
// 46733123453 timeout. All Sweden-prefixed so no real subscriber is touched.
const SANDBOX_DEFAULT_MSISDN = "46733123450";

// How long we wait on a mobile/card payment before calling it timed out.
const LIVE_TIMEOUT_MS = 60_000;

function normaliseMsisdn(raw: string): string {
  const trimmed = raw.trim().replace(/[\s-]/g, "");
  if (!trimmed) return "";
  if (trimmed.startsWith("+256")) return trimmed.slice(1);
  if (trimmed.startsWith("256")) return trimmed;
  if (trimmed.startsWith("0")) return "256" + trimmed.slice(1);
  return trimmed;
}

function roundUp(n: number, step: number): number {
  return Math.ceil(n / step) * step;
}

type Stage = "pick" | "live" | "failed" | "done";

function CollectPage() {
  const { id } = Route.useParams();
  const initialAss = Route.useLoaderData();
  const router = useRouter();
  const { data: assQuery, isLoading } = useAssessment(id, initialAss ?? undefined);
  // A waiver mutates the assessment server-side; hold the returned doc locally
  // so the total + splits reflect it immediately, without a refetch race.
  const [assOverride, setAssOverride] = useState<Assessment | null>(null);
  const ass = assOverride ?? assQuery;
  const [channel, setChannel] = useState<string>("Cash");
  const [msisdn, setMsisdn] = useState<string>(SANDBOX_DEFAULT_MSISDN);
  const [cashReceived, setCashReceived] = useState<string>("");
  const [intentName, setIntentName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("pick");
  const [failReason, setFailReason] = useState<string | null>(null);
  const [printStatus, setPrintStatus] = useState<"idle" | "printing" | "printed" | "error">("idle");
  const [printMsg, setPrintMsg] = useState<string | null>(null);
  const [fiscal, setFiscal] = useState<{ fdn?: string; code?: string; status?: string } | null>(null);
  const [correction, setCorrection] = useState<"void" | "refund" | "waiver" | null>(null);
  const [correctionError, setCorrectionError] = useState<string | null>(null);
  const [refunded, setRefunded] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const printedOnce = useRef(false);
  const finalizedRef = useRef(false);

  async function onDownloadPdf() {
    if (!intentName) return;
    setPdfBusy(true);
    try {
      await downloadReceiptPdf(intentName);
    } catch (e) {
      setPrintStatus("error");
      setPrintMsg((e as Error)?.message ?? "PDF download failed.");
    } finally {
      setPdfBusy(false);
    }
  }

  const createIntent = useCreatePaymentIntent();
  const initiate = useInitiatePayment();
  const confirm = useConfirmPayment();
  const refund = useRefundPayment();
  const voidAssessment = useVoidAssessment();
  const waive = useApplyDiscount();
  const { data: live } = usePaymentLiveStatus(stage === "live" ? intentName ?? undefined : undefined);

  // Live poll drives the mobile/card flow. When the aggregator reports the
  // money in, we still call our own confirm endpoint — that's what
  // materialises the Payment Events and issues the fiscal receipt — before
  // moving to done. A failure drops to the failed stage.
  useEffect(() => {
    if (stage !== "live") return;
    const status = String(live?.live?.status ?? "");
    if (status === "Confirmed") {
      void finalize();
    } else if (status === "Failed") {
      setFailReason("The payment failed — the citizen may have declined, or it dropped on the network.");
      setStage("failed");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live?.live?.status, stage]);

  // No dead-end spinner: if a mobile/card payment never confirms, time it out.
  useEffect(() => {
    if (stage !== "live") return;
    const t = setTimeout(() => {
      setFailReason("The payment didn't confirm in time. The citizen may not have approved it on their phone.");
      setStage("failed");
    }, LIVE_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [stage]);

  // Auto-print the receipt on confirmation; on cash the same job pops the
  // drawer. Fires once; a print failure is never fatal (payment is recorded).
  async function doPrint(reprint = false) {
    if (!intentName) return;
    setPrintStatus("printing");
    setPrintMsg(null);
    try {
      await printReceipt(intentName, { kick: channel === "Cash", reprint });
      setPrintStatus("printed");
    } catch (e) {
      setPrintStatus("error");
      setPrintMsg((e as Error)?.message ?? "Printing failed.");
    }
  }

  useEffect(() => {
    if (stage === "done" && intentName && !printedOnce.current) {
      printedOnce.current = true;
      void doPrint(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, intentName]);

  if (isLoading || !ass) {
    return <p className="text-muted-foreground">Loading assessment…</p>;
  }

  const total = Number(ass.total_amount ?? 0);
  const gross = Number(ass.gross_amount ?? ass.total_amount ?? 0);
  const waiver = Number(ass.discount_amount ?? 0);
  const currency = String(ass.fee_currency ?? "UGX");
  const needsMsisdn = MOBILE_MONEY_CHANNELS.has(channel);
  const received = Number(cashReceived || 0);
  const changeDue = cashReceived.trim() ? received - total : null;
  const quickAmounts = Array.from(
    new Set([total, roundUp(total, 1000), roundUp(total, 5000), roundUp(total, 10000)].filter((a) => a > 0)),
  ).sort((a, b) => a - b);
  const starting = createIntent.isPending || initiate.isPending || confirm.isPending;

  // Pull the fiscal result (FDN + verification code) off a confirm response.
  // The endpoint returns { intent, events, assessment }; the intent carries
  // the fiscal fields. Tolerant of either shape.
  function applyFiscal(res: unknown) {
    const wrap = res as { intent?: Record<string, unknown> } & Record<string, unknown>;
    const pi = wrap?.intent ?? (wrap as Record<string, unknown>);
    if (!pi) return;
    setFiscal({
      fdn: pi.fdn as string | undefined,
      code: pi.fiscal_verification_code as string | undefined,
      status: pi.fiscal_status as string | undefined,
    });
  }

  // Single settle path: confirm with the server (events + fiscalisation),
  // capture the FDN, then move to done. Guarded so the live poll and the
  // manual button can't double-confirm.
  async function finalize() {
    if (!intentName || finalizedRef.current) return;
    finalizedRef.current = true;
    setError(null);
    try {
      const res = await confirm.mutateAsync(intentName);
      applyFiscal(res);
      setStage("done");
    } catch (err) {
      finalizedRef.current = false; // let the clerk retry
      setError((err as Error)?.message ?? "Failed to confirm.");
    }
  }

  // Cash: take it, settle it, print + pop the drawer — no needless waiting.
  async function onTakeCash() {
    if (!ass) return;
    setError(null);
    try {
      const intent = await createIntent.mutateAsync({ assessment: ass.name, channel: "Cash" });
      setIntentName(intent.name);
      await initiate.mutateAsync(intent.name);
      finalizedRef.current = true;
      const res = await confirm.mutateAsync(intent.name);
      applyFiscal(res);
      setStage("done");
    } catch (err) {
      finalizedRef.current = false;
      setError((err as Error)?.message ?? "Couldn't take the cash payment.");
    }
  }

  // Mobile / card: push it, then watch the live status.
  async function onStart() {
    if (!ass) return;
    setError(null);
    if (needsMsisdn) {
      const cleaned = normaliseMsisdn(msisdn);
      if (!cleaned || cleaned.length < 10 || cleaned.length > 15) {
        setError("Enter a valid mobile-money number. The pre-filled sandbox test number works as-is.");
        return;
      }
    }
    try {
      const intent = await createIntent.mutateAsync({
        assessment: ass.name,
        channel,
        citizen_msisdn: needsMsisdn ? normaliseMsisdn(msisdn) : undefined,
      });
      setIntentName(intent.name);
      await initiate.mutateAsync(intent.name);
      setStage("live");
    } catch (err) {
      setError((err as Error)?.message ?? "Failed to start payment.");
    }
  }

  // "Mark as paid" — same settle path as the auto-advance.
  const onConfirm = finalize;

  // Start over with a fresh intent (e.g. after a failed mobile-money push).
  function onTryAgain() {
    setIntentName(null);
    setError(null);
    setFailReason(null);
    setFiscal(null);
    finalizedRef.current = false;
    setStage("pick");
  }

  // Void an unpaid assessment (citizen walked away before paying). No money
  // has moved, so it's clerk authority — reason only.
  async function onVoid(reason: string) {
    if (!ass) return;
    setCorrectionError(null);
    try {
      await voidAssessment.mutateAsync({ name: ass.name, reason });
      if (typeof window !== "undefined") localStorage.removeItem("work.draft");
      setCorrection(null);
      router.navigate({ to: "/work/assess" });
    } catch (err) {
      setCorrectionError((err as Error)?.message ?? "Couldn't void the assessment.");
    }
  }

  // Apply a supervisor-authorised fee waiver before payment — PIN required.
  async function onWaive(reason: string, pin: string, amount: number) {
    if (!ass) return;
    setCorrectionError(null);
    try {
      const updated = await waive.mutateAsync({ name: ass.name, amount, reason, supervisor_pin: pin });
      setAssOverride(updated);
      setCorrection(null);
    } catch (err) {
      setCorrectionError((err as Error)?.message ?? "Couldn't apply the waiver.");
    }
  }

  // Refund a settled payment — supervisor PIN required.
  async function onRefund(reason: string, pin: string) {
    if (!intentName) return;
    setCorrectionError(null);
    try {
      await refund.mutateAsync({ intent: intentName, reason, supervisor_pin: pin });
      setCorrection(null);
      setRefunded(true);
    } catch (err) {
      setCorrectionError((err as Error)?.message ?? "Refund failed.");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/work/assess">
            <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back to assess
          </Link>
        </Button>
      </div>

      {stage !== "done" && (
        <Card className="border-border shadow-sm">
          <CardContent className="p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Assessment</p>
            <h1 className="mt-1 font-mono text-lg">{ass.name}</h1>
            <p className="mt-3 font-display text-3xl font-semibold">
              {currency} {total.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">total due</p>
            {waiver > 0 && (
              <p className="mt-1 text-xs text-warning-foreground">
                Subtotal {currency} {gross.toLocaleString()} · waiver −{currency} {waiver.toLocaleString()}
                {ass.discount_reason ? ` (${ass.discount_reason})` : ""}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {stage === "pick" && (
        <Card className="border-border shadow-sm">
          <CardContent className="p-6">
            <h2 className="font-display text-xl font-semibold">Payment channel</h2>
            <p className="mt-1 text-sm text-muted-foreground">How is the citizen paying right now?</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {CHANNELS.map((c) => (
                <button
                  key={c.key}
                  onClick={() => setChannel(c.key)}
                  className={`rounded-lg border p-4 text-left transition-colors ${
                    channel === c.key ? "border-primary bg-primary/5" : "border-border bg-background hover:border-primary/40"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {c.key === "Cash" ? (
                      <Banknote className="h-5 w-5 text-primary" />
                    ) : (
                      <Wallet className="h-5 w-5 text-primary" />
                    )}
                    <p className="font-semibold">{c.label}</p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{c.desc}</p>
                </button>
              ))}
            </div>

            {/* Cash — tender + change */}
            {channel === "Cash" && (
              <div className="mt-5 space-y-3">
                <label htmlFor="cash" className="text-sm font-medium text-foreground">
                  Cash received <span className="font-normal text-muted-foreground">(to compute change)</span>
                </label>
                <input
                  id="cash"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={cashReceived}
                  onChange={(e) => setCashReceived(e.target.value)}
                  placeholder={total.toLocaleString()}
                  className="h-12 w-full rounded-md border border-input bg-background px-3 text-lg font-mono"
                />
                <div className="flex flex-wrap gap-2">
                  {quickAmounts.map((a) => (
                    <Button key={a} size="sm" variant="outline" onClick={() => setCashReceived(String(a))}>
                      {a === total ? "Exact" : a.toLocaleString()}
                    </Button>
                  ))}
                </div>
                {changeDue !== null && (
                  <div className="flex items-center justify-between rounded-md bg-surface-muted p-3 text-sm">
                    <span className="font-medium">{changeDue < 0 ? "Short by" : "Change due"}</span>
                    <span className={`font-mono text-lg font-semibold ${changeDue < 0 ? "text-destructive" : "text-success"}`}>
                      {currency} {Math.abs(changeDue).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Mobile money — payer number */}
            {needsMsisdn && (
              <div className="mt-5 space-y-2">
                <label htmlFor="msisdn" className="text-sm font-medium text-foreground">
                  Citizen mobile-money number
                </label>
                <input
                  id="msisdn"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="0772123456 or +256772123456"
                  value={msisdn}
                  onChange={(e) => setMsisdn(e.target.value)}
                  className="h-12 w-full rounded-md border border-input bg-background px-3 text-base font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Pre-filled with the MTN sandbox auto-approve number. Use{" "}
                  <code className="font-mono">46733123452</code> to test a failed push or{" "}
                  <code className="font-mono">46733123453</code> for a timeout.
                </p>
              </div>
            )}

            {error && (
              <div className="mt-4 flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {error}
              </div>
            )}

            <Button
              className="mt-5 h-14 w-full text-base"
              onClick={channel === "Cash" ? onTakeCash : onStart}
              disabled={starting}
            >
              {starting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {channel === "Cash" ? "Taking payment…" : "Starting…"}</>
              ) : channel === "Cash" ? (
                <>Take cash payment <ArrowRight className="ml-2 h-4 w-4" /></>
              ) : (
                <>Start payment <ArrowRight className="ml-2 h-4 w-4" /></>
              )}
            </Button>

            <div className="mt-3 flex items-center justify-center gap-4">
              <button
                onClick={() => { setCorrectionError(null); setCorrection("waiver"); }}
                className="text-xs text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
              >
                {waiver > 0 ? "Adjust waiver" : "Apply supervisor waiver"}
              </button>
              <span className="text-muted-foreground/40">·</span>
              <button
                onClick={() => { setCorrectionError(null); setCorrection("void"); }}
                className="text-xs text-muted-foreground underline-offset-2 hover:text-destructive hover:underline"
              >
                Void this assessment
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {stage === "live" && (
        <Card className="border-info/30 bg-info/5 shadow-sm">
          <CardContent className="space-y-4 p-6 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-info" />
            <h2 className="font-display text-xl font-semibold">Waiting for payment confirmation</h2>
            <p className="text-sm text-muted-foreground">
              Intent <code className="font-mono">{intentName}</code> · channel{" "}
              <span className="font-semibold">{channel}</span>.
              {live?.live?.status && (
                <> · status: <Badge className="border-0 bg-info/15 text-info">{String(live.live.status)}</Badge></>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              We&apos;re polling the aggregator. It confirms on its own once the citizen approves on their
              phone — or click below if you&apos;ve seen it land.
            </p>
            {error && (
              <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {error}
              </div>
            )}
            <div className="flex flex-wrap justify-center gap-2">
              <Button className="h-12 flex-1 text-base" onClick={onConfirm} disabled={confirm.isPending}>
                {confirm.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Confirming…</> : "Mark as paid"}
              </Button>
              <Button variant="ghost" className="h-12" onClick={onTryAgain}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {stage === "failed" && (
        <Card className="border-destructive/30 bg-destructive/5 shadow-sm">
          <CardContent className="space-y-4 p-8 text-center">
            <XCircle className="mx-auto h-12 w-12 text-destructive" />
            <h2 className="font-display text-2xl font-semibold">Payment not completed</h2>
            <p className="mx-auto max-w-sm text-sm text-muted-foreground">
              {failReason ?? "The payment didn't go through."} Nothing was charged — try a different way, or
              cancel and the bill stays open.
            </p>
            <div className="flex flex-wrap justify-center gap-2 pt-1">
              <Button className="h-12 text-base" onClick={onTryAgain}>
                <RotateCcw className="mr-2 h-4 w-4" /> Try a different way
              </Button>
              <Button asChild variant="ghost" className="h-12 text-base">
                <Link to="/work/assess">Leave for now</Link>
              </Button>
            </div>
            <button
              onClick={() => { setCorrectionError(null); setCorrection("void"); }}
              className="text-xs text-muted-foreground underline-offset-2 hover:text-destructive hover:underline"
            >
              Void this assessment
            </button>
          </CardContent>
        </Card>
      )}

      {stage === "done" && (
        <div className={refunded ? "" : "grid gap-5 lg:grid-cols-2 lg:items-start"}>
        <Card className={refunded ? "border-warning/40 bg-warning/5 shadow-sm" : "border-success/30 bg-success/5 shadow-sm"}>
          <CardContent className="space-y-4 p-8 text-center">
            {refunded ? (
              <>
                <RotateCcw className="mx-auto h-12 w-12 text-warning-foreground" />
                <h2 className="font-display text-2xl font-semibold">Payment refunded</h2>
                <p className="mx-auto max-w-sm text-sm text-muted-foreground">
                  The payment was reversed and the assessment cancelled. Hand back the money and give the
                  citizen the voided receipt.
                </p>
              </>
            ) : (
              <>
                <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
                <h2 className="font-display text-2xl font-semibold">Payment confirmed</h2>
              </>
            )}
            {!refunded && channel === "Cash" && changeDue !== null && changeDue > 0 && (
              <p className="text-sm font-medium">
                Give change: <span className="font-mono">{currency} {changeDue.toLocaleString()}</span>
              </p>
            )}
            {fiscal?.fdn ? (
              <div className="mx-auto max-w-sm rounded-md border border-success/30 bg-background/60 p-3 text-left text-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-success">URA EFRIS · fiscalised</p>
                <p className="mt-1">
                  FDN <span className="font-mono">{fiscal.fdn}</span>
                </p>
                {fiscal.code && (
                  <p className="text-muted-foreground">
                    Verify code <span className="font-mono">{fiscal.code}</span>
                  </p>
                )}
              </div>
            ) : fiscal?.status === "Failed" ? (
              <p className="text-xs text-warning-foreground">
                Fiscalisation pending — the receipt will be fiscalised with URA shortly. Payment is recorded.
              </p>
            ) : null}
            {printStatus === "printing" && (
              <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Printing receipt
                {channel === "Cash" ? " and opening the drawer" : ""}…
              </p>
            )}
            {printStatus === "printed" && (
              <p className="text-sm text-muted-foreground">
                Receipt printed{channel === "Cash" ? " · drawer opened" : ""}.
              </p>
            )}
            {printStatus === "error" && (
              <div className="mx-auto flex max-w-sm gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-left text-sm text-destructive">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Couldn&apos;t print: {printMsg} The payment is recorded — retry below.</span>
              </div>
            )}
            <div className="flex flex-wrap justify-center gap-2 pt-2">
              {!refunded && (
                <Button
                  variant="outline"
                  className="h-12 text-base"
                  onClick={() => doPrint(printStatus === "printed")}
                  disabled={printStatus === "printing"}
                >
                  <Printer className="mr-2 h-4 w-4" />
                  {printStatus === "error" ? "Retry print" : "Reprint"}
                </Button>
              )}
              <Button variant="outline" className="h-12 text-base" onClick={onDownloadPdf} disabled={pdfBusy}>
                {pdfBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                PDF receipt
              </Button>
              <Button asChild className="h-12 text-base">
                <Link to="/work/assess">
                  Next citizen <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="ghost" className="h-12 text-base">
                <Link to="/work/shift">Back to shift</Link>
              </Button>
            </div>

            {!refunded && (
              <button
                onClick={() => { setCorrectionError(null); setCorrection("refund"); }}
                className="mt-1 text-xs text-muted-foreground underline-offset-2 hover:text-destructive hover:underline"
              >
                Refund / reverse this payment
              </button>
            )}
          </CardContent>
        </Card>

        {!refunded && <SettlementPanel intent={intentName} enabled={stage === "done"} />}
        </div>
      )}

      <CorrectionDialog
        open={correction === "void"}
        onOpenChange={(o) => { if (!o) setCorrection(null); }}
        mode="void"
        title="Void this assessment?"
        description="The citizen hasn't paid. Voiding cancels the assessment — no money is involved."
        busy={voidAssessment.isPending}
        error={correctionError}
        onSubmit={(reason) => void onVoid(reason)}
      />
      <CorrectionDialog
        open={correction === "refund"}
        onOpenChange={(o) => { if (!o) setCorrection(null); }}
        mode="refund"
        title="Refund this payment?"
        description="Reverses the settled payment and cancels the assessment. A supervisor must authorise it."
        busy={refund.isPending}
        error={correctionError}
        onSubmit={(reason, pin) => void onRefund(reason, pin)}
      />
      <CorrectionDialog
        open={correction === "waiver"}
        onOpenChange={(o) => { if (!o) setCorrection(null); }}
        mode="waiver"
        title="Apply a fee waiver?"
        description="Reduces the payable before payment. A supervisor must authorise it; the reason is recorded on the receipt."
        currency={currency}
        maxAmount={gross}
        busy={waive.isPending}
        error={correctionError}
        onSubmit={(reason, pin, amount) => void onWaive(reason, pin, amount)}
      />
    </div>
  );
}
