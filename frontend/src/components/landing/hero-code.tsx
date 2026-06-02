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
// Hero code sample — fetches a real `/v1/mdas` slice and renders it as
// the actual response body of the curl. No static JSON anywhere; the
// JSON the visitor sees is what their own curl would return right now.

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAgencies } from "@/lib/agencies";

type Tab = "curl" | "python" | "node";

const TABS: Tab[] = ["curl", "python", "node"];

const COMMAND: Record<Tab, string> = {
  curl: 'curl https://sente-rails.space/v1/mdas',
  python: 'import httpx\nr = httpx.get("https://sente-rails.space/v1/mdas")\nmdas = r.json()["data"]',
  node: 'const r = await fetch("https://sente-rails.space/v1/mdas");\nconst { data: mdas } = await r.json();',
};

export function HeroCode() {
  const { data: agencies = [], isLoading } = useAgencies();
  const [tab, setTab] = useState<Tab>("curl");
  const [copied, setCopied] = useState(false);

  // Real response — first 3 agencies, sorted to lead with live/sandbox.
  const sample = (() => {
    if (isLoading) return null;
    const order: Record<string, number> = { live: 0, sandbox: 1, planned: 2, inquiry: 3 };
    const top = [...agencies]
      .sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9))
      .slice(0, 3)
      .map((a) => ({
        short_code: a.code,
        full_name: a.full,
        mode: a.mode,
        integration_status: a.status,
        endpoint_count: a.endpoints,
      }));
    return JSON.stringify({ data: top }, null, 2);
  })();

  const fullText = `$ ${COMMAND[tab]}\n\n${sample ?? "// loading live response…"}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface-muted shadow-sm">
      <div className="flex items-center justify-between border-b border-border bg-background px-3 py-2">
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                tab === t
                  ? "bg-surface-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={copy} aria-label="Copy">
          {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
      <pre className="overflow-x-auto px-4 py-3 font-mono text-[12px] leading-relaxed text-foreground">
        <code>
          <span className="text-muted-foreground">$ </span>
          {COMMAND[tab]}
          {"\n\n"}
          {sample ?? (
            <span className="text-muted-foreground">{"// loading live response…"}</span>
          )}
        </code>
      </pre>
    </div>
  );
}
