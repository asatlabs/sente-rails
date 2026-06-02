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
// /dashboard/billing — tier + usage placeholder. No payment integration yet.

import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Coins, Check, Loader2 } from "lucide-react";
import { fetchMe, useMe, type MeProfile } from "@/lib/me";

export const Route = createFileRoute("/dashboard/billing")({
  head: () => ({ meta: [{ title: "Billing · Sente Rails" }] }),
  loader: () => fetchMe().catch(() => null as MeProfile | null),
  component: BillingPage,
});

function BillingPage() {
  const initialMe = Route.useLoaderData();
  const { data: me, isLoading } = useMe(initialMe ?? undefined);
  if (isLoading || !me) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          Billing
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your current tier, included usage, and how to upgrade.
        </p>
      </header>

      <Card className="border-border shadow-none">
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-xl font-semibold">{me.pricing_tier}</h2>
                <Badge className="border-0 bg-success/15 text-success">Active</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {me.tier} integrator · started {me.tos_accepted_on?.split(" ")[0] ?? "—"}
              </p>
            </div>
            <Coins className="h-6 w-6 text-muted-foreground" />
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-border bg-surface-muted p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Requests · last 7 days
              </p>
              <p className="mt-1 font-display text-2xl font-semibold">
                {me.requests_last_7d.toLocaleString()}
              </p>
            </div>
            <div className="rounded-md border border-border bg-surface-muted p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Active keys
              </p>
              <p className="mt-1 font-display text-2xl font-semibold">{me.keys.active}</p>
            </div>
            <div className="rounded-md border border-border bg-surface-muted p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Environment
              </p>
              <p className="mt-1 font-display text-base font-semibold">Sandbox</p>
              <p className="text-xs text-muted-foreground">No live tier yet</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border shadow-none">
        <CardContent className="space-y-3 p-5">
          <h2 className="font-display text-base font-semibold">Free tier — included</h2>
          <ul className="space-y-2 text-sm">
            <li className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              <span>Full /v1 surface — citizens, services, MDAs, payment intents, oversight*, audit log.</span>
            </li>
            <li className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              <span>Sandbox keys with rotation + revoke + 90-day audit retention.</span>
            </li>
            <li className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              <span>Best-effort response SLAs from ops; no production support.</span>
            </li>
          </ul>
          <p className="pt-2 text-xs text-muted-foreground">
            *Oversight endpoints require the <code className="rounded bg-surface-muted px-1 font-mono">oversight.read</code> scope,
            granted only to mode=C integrators (OAG, MoFPED, UBOS, MoLG).
          </p>
        </CardContent>
      </Card>

      <Card className="border-border shadow-none">
        <CardContent className="p-5">
          <h2 className="font-display text-base font-semibold">Need a live-tier key?</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Production keys carry an MoU + KYC step and are issued by ops, not via
            self-serve. Email us at{" "}
            <a href="mailto:asatlabs@gmail.com" className="text-primary hover:underline">
              asatlabs@gmail.com
            </a>{" "}
            with your MDA / business name, intended use, and anticipated volume.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
