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
// Station hardware setup — connect QZ Tray, pick the counter's thermal
// printer (persisted per machine), and self-test the printer + cash drawer.

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Plug, Printer, TriangleAlert } from "lucide-react";
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

type State = "idle" | "connecting" | "ready" | "error";

export function PrinterSetup() {
  const [state, setState] = useState<State>("idle");
  const [printers, setPrinters] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Read the saved printer client-side (localStorage is browser-only).
  useEffect(() => {
    const saved = getSavedPrinter();
    if (saved) {
      setSelected(saved);
      setState("ready");
    }
  }, []);

  async function onConnect() {
    setState("connecting");
    setMsg(null);
    try {
      await connect();
      const found = await listPrinters();
      setPrinters(found);
      let pick = selected;
      if (!pick || !found.includes(pick)) {
        try {
          pick = (await getDefaultPrinter()) || found[0] || "";
        } catch {
          pick = found[0] || "";
        }
      }
      if (pick) {
        setSelected(pick);
        setSavedPrinter(pick);
      }
      setState("ready");
      setMsg(found.length ? null : "QZ Tray is connected, but no printers were found.");
    } catch (e) {
      setState("error");
      setMsg((e as Error)?.message ?? "Couldn't connect to QZ Tray.");
    }
  }

  function onPick(name: string) {
    setSelected(name);
    setSavedPrinter(name);
  }

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setMsg(null);
    try {
      await fn();
      setMsg(`${label} sent.`);
    } catch (e) {
      setMsg((e as Error)?.message ?? `${label} failed.`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="border-border shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Printer className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Station hardware</h3>
          </div>
          {state === "ready" && selected ? (
            <span className="flex items-center gap-1 text-xs text-success">
              <CheckCircle2 className="h-3.5 w-3.5" /> {selected}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">Printer not set</span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={onConnect} disabled={state === "connecting"}>
            {state === "connecting" ? (
              <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Connecting…</>
            ) : (
              <><Plug className="mr-2 h-3.5 w-3.5" /> Connect &amp; find printers</>
            )}
          </Button>
          {printers.length > 0 && (
            <select
              value={selected}
              onChange={(e) => onPick(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              {printers.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          )}
          {selected && (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => run("Test print", () => testPrint(selected))}
                disabled={!!busy}
              >
                Test print
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => run("Drawer kick", () => kickDrawer(selected))}
                disabled={!!busy}
              >
                Test drawer
              </Button>
            </>
          )}
        </div>

        {msg && (
          <p
            className={`mt-3 flex items-start gap-1.5 text-xs ${
              state === "error" ? "text-destructive" : "text-muted-foreground"
            }`}
          >
            {state === "error" && <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
            {msg}
          </p>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">
          Requires QZ Tray running on this counter PC. The chosen printer is remembered on this
          machine.
        </p>
      </CardContent>
    </Card>
  );
}
