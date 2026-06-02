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
// StationReadiness — one compact, collapsible widget that folds the old
// "Station hardware" + "Station self-test" cards together. Neutral by default
// (no alarm until the clerk actually checks), it runs the three readiness
// checks, lets them pick the thermal printer, and offers a physical test slip
// + drawer kick.

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Loader2,
  Printer,
  ShieldCheck,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  connect,
  getDefaultPrinter,
  getSavedPrinter,
  kickDrawer,
  listPrinters,
  setSavedPrinter,
  testPrint,
} from "@/lib/printer";
import { fetchWorkWhoami } from "@/lib/work";

type S = "idle" | "running" | "pass" | "warn" | "fail";
type Check = { key: string; label: string; state: S; detail?: string };

const INITIAL: Check[] = [
  { key: "service", label: "Counter service", state: "idle" },
  { key: "bridge", label: "Printing service", state: "idle" },
  { key: "printer", label: "Thermal printer", state: "idle" },
];

export function StationReadiness({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [selected, setSelected] = useState("");
  const [printers, setPrinters] = useState<string[]>([]);
  const [checks, setChecks] = useState<Check[]>(INITIAL);
  const [running, setRunning] = useState(false);
  const [ran, setRan] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [hwMsg, setHwMsg] = useState<string | null>(null);

  useEffect(() => {
    const saved = getSavedPrinter();
    if (saved) setSelected(saved);
  }, []);

  function set(key: string, state: S, detail?: string) {
    setChecks((prev) => prev.map((c) => (c.key === key ? { ...c, state, detail } : c)));
  }

  async function runCheck() {
    setOpen(true);
    setRunning(true);
    setRan(true);
    setHwMsg(null);
    setChecks(INITIAL.map((c) => ({ ...c })));

    set("service", "running");
    try {
      const who = await fetchWorkWhoami();
      who?.authenticated ? set("service", "pass", who.user?.full_name) : set("service", "fail", "Not signed in.");
    } catch (e) {
      set("service", "fail", (e as Error)?.message ?? "Unreachable.");
    }

    let bridgeUp = false;
    set("bridge", "running");
    try {
      await connect();
      bridgeUp = true;
      set("bridge", "pass");
    } catch (e) {
      set("bridge", "fail", (e as Error)?.message ?? "Not running on this PC.");
    }

    set("printer", "running");
    if (!bridgeUp) {
      set("printer", "warn", "Skipped — service down.");
    } else {
      try {
        const found = await listPrinters();
        setPrinters(found);
        let pick = getSavedPrinter() || selected;
        if (!pick || !found.includes(pick)) {
          try {
            pick = (await getDefaultPrinter()) || found[0] || "";
          } catch {
            pick = found[0] || "";
          }
          if (pick) {
            setSelected(pick);
            setSavedPrinter(pick);
          }
        }
        if (pick && found.includes(pick)) set("printer", "pass", pick);
        else if (found.length) set("printer", "warn", "Pick a printer below.");
        else set("printer", "fail", "No printers found.");
      } catch (e) {
        set("printer", "fail", (e as Error)?.message ?? "Couldn't list printers.");
      }
    }
    setRunning(false);
  }

  function pickPrinter(name: string) {
    setSelected(name);
    setSavedPrinter(name);
    set("printer", "pass", name);
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

  // Header verdict — neutral until a check has run.
  const verdict: { tone: string; label: string } = !ran
    ? selected
      ? { tone: "muted", label: `Printer: ${selected}` }
      : { tone: "muted", label: "Not checked yet" }
    : running
      ? { tone: "muted", label: "Checking…" }
      : checks.some((c) => c.state === "fail")
        ? { tone: "destructive", label: "Needs attention" }
        : checks.some((c) => c.state === "warn")
          ? { tone: "warning", label: "Almost ready" }
          : { tone: "success", label: "Ready to trade" };

  const toneCls =
    verdict.tone === "success"
      ? "text-success"
      : verdict.tone === "warning"
        ? "text-warning-foreground"
        : verdict.tone === "destructive"
          ? "text-destructive"
          : "text-muted-foreground";

  return (
    <Card className="border-border shadow-sm">
      <CardContent className="p-0">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left"
        >
          <span className="flex items-center gap-2.5">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Station readiness</span>
            <span className={`text-xs ${toneCls}`}>· {verdict.label}</span>
          </span>
          <span className="flex items-center gap-2">
            {!ran && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); void runCheck(); }}
                className="rounded-md border border-input px-2.5 py-1 text-xs font-medium hover:bg-muted"
              >
                Check
              </span>
            )}
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
          </span>
        </button>

        {open && (
          <div className="space-y-3 border-t border-border px-5 py-4">
            <ul className="space-y-1.5">
              {checks.map((c) => (
                <li key={c.key} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2">
                    <Icon state={c.state} />
                    <span className={c.state === "fail" ? "text-destructive" : ""}>{c.label}</span>
                  </span>
                  {c.detail && <span className="truncate text-xs text-muted-foreground">{c.detail}</span>}
                </li>
              ))}
            </ul>

            {printers.length > 0 && (
              <select
                value={selected}
                onChange={(e) => pickPrinter(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">— choose the counter printer —</option>
                {printers.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={runCheck} disabled={running}>
                {running ? <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Checking…</> : "Run self-test"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => hw("Test slip", () => testPrint())} disabled={!!busy}>
                <Printer className="mr-1.5 h-3.5 w-3.5" /> Test slip
              </Button>
              <Button size="sm" variant="ghost" onClick={() => hw("Drawer kick", () => kickDrawer())} disabled={!!busy}>
                Test drawer
              </Button>
            </div>

            {hwMsg && <p className="text-xs text-muted-foreground">{hwMsg}</p>}
            <p className="text-[11px] text-muted-foreground">
              Requires the printing service running on this counter PC. The chosen printer is remembered here.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Icon({ state }: { state: S }) {
  if (state === "running") return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  if (state === "pass") return <CheckCircle2 className="h-4 w-4 text-success" />;
  if (state === "warn") return <TriangleAlert className="h-4 w-4 text-warning-foreground" />;
  if (state === "fail") return <XCircle className="h-4 w-4 text-destructive" />;
  return <span className="inline-block h-4 w-4 rounded-full border border-muted-foreground/30" />;
}
