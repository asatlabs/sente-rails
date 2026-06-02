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
// Interactive walkthrough — the proof-it's-real section. Each step
// fires an actual /v1 request against the live sandbox and renders the
// response inline. Step 3 needs auth → funnels the visitor to /signup.
//
// "no static" — when the visitor clicks Run, they get a fresh JSON
// from the live rail. The whole landing's credibility ride on this
// being immediate, not staged.

import { useState } from "react";
import { ArrowRight, CheckCircle2, Loader2, Play, TriangleAlert } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

type Step = {
  n: number;
  title: string;
  description: string;
  method: "GET" | "POST";
  url: string;
  requiresAuth?: boolean;
};

const STEPS: Step[] = [
  {
    n: 1,
    title: "List the agencies",
    description:
      "Public endpoint — no key, no headers. The same /v1/mdas the workbench reads.",
    method: "GET",
    url: "/v1/mdas",
  },
  {
    n: 2,
    title: "Browse services at an MDA",
    description:
      "Filter the same surface. Returns fees, fee bases, EFRIS status — the live catalogue.",
    method: "GET",
    url: "/v1/services?mda=GULU",
  },
  {
    n: 3,
    title: "Create an assessment",
    description:
      "Authenticated surface. Bearer key required — sign up to get one in sixty seconds.",
    method: "POST",
    url: "/v1/assessments",
    requiresAuth: true,
  },
];

function StepCard({ step }: { step: Step }) {
  const [output, setOutput] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (step.requiresAuth) return;
    setError(null);
    setRunning(true);
    try {
      const res = await fetch(step.url);
      const json = await res.json();
      // Truncate list responses to ~3 rows so it fits in the card.
      let display: unknown = json;
      if (json && Array.isArray(json.data) && json.data.length > 3) {
        display = {
          data: json.data.slice(0, 3),
          _truncated: `${json.data.length - 3} more rows omitted`,
        };
      }
      setOutput(JSON.stringify(display, null, 2));
    } catch (e) {
      setError((e as Error)?.message ?? "Network error.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <article className="flex flex-col rounded-lg border border-border bg-background p-5">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
          {step.n}
        </span>
        <h3 className="font-display text-base font-semibold">{step.title}</h3>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {step.description}
      </p>
      <div className="mt-3 rounded-md border border-border bg-surface-muted px-3 py-2 font-mono text-[11.5px]">
        <span
          className={
            step.method === "GET"
              ? "font-semibold text-info"
              : "font-semibold text-warning-foreground"
          }
        >
          {step.method}
        </span>{" "}
        {step.url}
      </div>

      <div className="mt-3 flex-1">
        {step.requiresAuth ? (
          <Button asChild className="h-9 w-full" variant="outline">
            <Link to="/signup">
              Get a sandbox key
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        ) : (
          <Button
            onClick={run}
            disabled={running}
            className="h-9 w-full"
            variant={output ? "outline" : "default"}
          >
            {running ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <>
                {output ? (
                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                ) : (
                  <Play className="mr-1.5 h-3 w-3" />
                )}
                {running ? "Calling…" : output ? "Run again" : "Try it"}
              </>
            )}
          </Button>
        )}

        {error && (
          <div className="mt-2 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-[11px] text-destructive">
            <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
            {error}
          </div>
        )}

        {output && (
          <pre className="mt-2 max-h-48 overflow-auto rounded-md border border-border bg-surface-muted p-2.5 font-mono text-[11px] leading-relaxed">
            <code>{output}</code>
          </pre>
        )}
      </div>
    </article>
  );
}

export function Walkthrough() {
  return (
    <section className="border-b border-border bg-background">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <header className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
            Try it now
          </p>
          <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Three calls. Real responses. No sign-up for the first two.
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Each <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-[11.5px]">Try it</code>{" "}
            button below makes an actual live request to{" "}
            <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-[11.5px]">sente-rails.space</code>{" "}
            and shows you the response.
          </p>
        </header>
        <div className="mt-8 grid gap-3 sm:gap-4 lg:grid-cols-3">
          {STEPS.map((s) => (
            <StepCard key={s.n} step={s} />
          ))}
        </div>
      </div>
    </section>
  );
}
