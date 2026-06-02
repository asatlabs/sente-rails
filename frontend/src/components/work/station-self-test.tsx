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
// StationSelfTest — a one-tap "is this counter ready to trade?" check.
//
// Runs three automated checks (counter service reachable, printer bridge up,
// a thermal printer selected + present) and shows a clear verdict, then lets
// the clerk print a physical test slip + pop the drawer to confirm the
// hardware end-to-end. Meant to be run at the start of a shift.

import { useState } from "react";
import { CheckCircle2, Loader2, Printer, ShieldCheck, TriangleAlert, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { connect, getSavedPrinter, kickDrawer, listPrinters, testPrint } from "@/lib/printer";
import { fetchWorkWhoami } from "@/lib/work";

type CheckState = "idle" | "running" | "pass" | "warn" | "fail";

type Check = { key: string; label: string; state: CheckState; detail?: string };

const INITIAL: Check[] = [
  { key: "service", label: "Counter service reachable", state: "idle" },
  { key: "bridge", label: "Printer bridge (printing service)", state: "idle" },
  { key: "printer", label: "Thermal printer ready", state: "idle" },
];

export function StationSelfTest() {
  const [checks, setChecks] = useState<Check[]>(INITIAL);
  const [running, setRunning] = useState(false);
  const [ran, setRan] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [hwMsg, setHwMsg] = useState<string | null>(null);

  function set(key: string, state: CheckState, detail?: string) {
    setChecks((prev) => prev.map((c) => (c.key === key ? { ...c, state, detail } : c)));
  }

  async function runSelfTest() {
    setRunning(true);
    setRan(true);
    setHwMsg(null);
    setChecks(INITIAL.map((c) => ({ ...c })));

    // 1) Counter service (backend session + role).
    set("service", "running");
    try {
      const who = await fetchWorkWhoami();
      if (who?.authenticated) set("service", "pass", who.user?.full_name ?? undefined);
      else set("service", "fail", "Not signed in.");
    } catch (e) {
      set("service", "fail", (e as Error)?.message ?? "Unreachable.");
    }

    // 2) Printer bridge reachable.
    let bridgeUp = false;
    set("bridge", "running");
    try {
      await connect();
      bridgeUp = true;
      set("bridge", "pass");
    } catch (e) {
      set("bridge", "fail", (e as Error)?.message ?? "Not running on this PC.");
    }

    // 3) A thermal printer is selected + actually present.
    set("printer", "running");
    if (!bridgeUp) {
      set("printer", "warn", "Skipped — bridge is down.");
    } else {
      try {
        const found = await listPrinters();
        const saved = getSavedPrinter();
        if (saved && found.includes(saved)) set("printer", "pass", saved);
        else if (saved) set("printer", "fail", `Saved printer "${saved}" not found.`);
        else if (found.length) set("printer", "warn", "No printer chosen — set one in Station hardware.");
        else set("printer", "fail", "No printers found.");
      } catch (e) {
        set("printer", "fail", (e as Error)?.message ?? "Couldn't list printers.");
      }
    }

    setRunning(false);
  }

  async function hw(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setHwMsg(null);
    try {
      await fn();
      setHwMsg(`${label} sent — confirm it at the printer.`);
    } catch (e) {
      setHwMsg((e as Error)?.message ?? `${label} failed.`);
    } finally {
      setBusy(null);
    }
  }

  const verdict: "ready" | "issues" | null = !ran || running
    ? null
    : checks.some((c) => c.state === "fail")
      ? "issues"
      : checks.some((c) => c.state === "warn")
        ? "issues"
        : "ready";

  return (
    <Card className="border-border shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Station self-test</h3>
          </div>
          {verdict === "ready" && (
            <span className="flex items-center gap-1 text-xs text-success">
              <CheckCircle2 className="h-3.5 w-3.5" /> Ready to trade
            </span>
          )}
          {verdict === "issues" && (
            <span className="flex items-center gap-1 text-xs text-warning-foreground">
              <TriangleAlert className="h-3.5 w-3.5" /> Needs attention
            </span>
          )}
        </div>

        {ran && (
          <ul className="mt-3 space-y-1.5">
            {checks.map((c) => (
              <li key={c.key} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2">
                  <StatusIcon state={c.state} />
                  <span className={c.state === "fail" ? "text-destructive" : ""}>{c.label}</span>
                </span>
                {c.detail && <span className="truncate text-xs text-muted-foreground">{c.detail}</span>}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={runSelfTest} disabled={running}>
            {running ? (
              <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Checking…</>
            ) : (
              <><ShieldCheck className="mr-2 h-3.5 w-3.5" /> Run self-test</>
            )}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => hw("Test slip", () => testPrint())} disabled={!!busy}>
            <Printer className="mr-1.5 h-3.5 w-3.5" /> Print test slip
          </Button>
          <Button size="sm" variant="ghost" onClick={() => hw("Drawer kick", () => kickDrawer())} disabled={!!busy}>
            Test drawer
          </Button>
        </div>

        {hwMsg && <p className="mt-3 text-xs text-muted-foreground">{hwMsg}</p>}
      </CardContent>
    </Card>
  );
}

function StatusIcon({ state }: { state: CheckState }) {
  if (state === "running") return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  if (state === "pass") return <CheckCircle2 className="h-4 w-4 text-success" />;
  if (state === "warn") return <TriangleAlert className="h-4 w-4 text-warning-foreground" />;
  if (state === "fail") return <XCircle className="h-4 w-4 text-destructive" />;
  return <span className="h-4 w-4" />;
}
