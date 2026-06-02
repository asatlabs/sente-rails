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
// /dashboard — overview tile. Driven by /v1/me. The layout (dashboard.tsx)
// owns the top-tab nav + auth guard; this leaf renders the data.

import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  CheckCircle2,
  CircleAlert,
  KeyRound,
  Loader2,
  ScrollText,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchMe, useMe, type MeProfile } from "@/lib/me";

export const Route = createFileRoute("/dashboard/")({
  head: () => ({
    meta: [{ title: "Dashboard · Sente Rails" }],
  }),
  loader: () => fetchMe().catch(() => null as MeProfile | null),
  component: DashboardOverview,
});

function DashboardOverview() {
  const initialMe = Route.useLoaderData();
  const { data: me, isLoading, error } = useMe(initialMe ?? undefined);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading your account…
      </div>
    );
  }
  if (error || !me) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        Couldn&apos;t load your profile.{" "}
        <Link to="/signin" className="underline">Try signing in again</Link>.
      </div>
    );
  }

  const verified = me.email_verified === 1;
  const lastLogin = me.last_login_at ? new Date(me.last_login_at).toLocaleString() : "—";

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
          Signed in
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-foreground">
          {me.display_name}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          <code className="rounded bg-surface-muted px-1 py-0.5 font-mono">{me.name}</code>{" "}
          · {me.contact_email} · {me.tier} ({me.pricing_tier}) · last login{" "}
          <span className="font-mono text-foreground">{lastLogin}</span>
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="border-border shadow-none">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                API keys
              </p>
              <KeyRound className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="mt-2 font-display text-2xl font-semibold">
              {me.keys.active}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                active of {me.keys.total}
              </span>
            </p>
            <Button asChild variant="link" size="sm" className="mt-2 -mx-3 text-primary">
              <Link to="/dashboard/keys">
                Manage keys <ArrowUpRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border shadow-none">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Requests · 7d
              </p>
              <ScrollText className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="mt-2 font-display text-2xl font-semibold">
              {me.requests_last_7d.toLocaleString()}
            </p>
            <Button asChild variant="link" size="sm" className="mt-2 -mx-3 text-primary">
              <Link to="/dashboard/logs">
                Open logs <ArrowUpRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border shadow-none">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Account
              </p>
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="mt-2 font-display text-base font-semibold">
              {me.status}{" "}
              <Badge
                className={
                  verified
                    ? "ml-1 bg-success/15 text-success border-0 align-middle text-[10px]"
                    : "ml-1 bg-warning/15 text-warning-foreground border-0 align-middle text-[10px]"
                }
              >
                {verified ? "Email verified" : "Email unverified"}
              </Badge>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {me.tier} · {me.pricing_tier} tier
            </p>
          </CardContent>
        </Card>
      </div>

      {!verified && (
        <div className="flex gap-3 rounded-md border border-warning/30 bg-warning/5 p-4 text-sm">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning-foreground" />
          <div>
            <p className="font-medium text-foreground">Email not yet verified</p>
            <p className="mt-1 text-muted-foreground">
              This account was created before the OTP signup flow. Verification keeps
              account-recovery options open — contact ops at{" "}
              <a href="mailto:asatlabs@gmail.com" className="text-primary hover:underline">
                asatlabs@gmail.com
              </a>{" "}
              to verify it.
            </p>
          </div>
        </div>
      )}

      <Card className="border-border shadow-none">
        <CardContent className="p-5">
          <h2 className="font-display text-base font-semibold text-foreground">
            What now?
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li className="flex gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              <span>
                Read the{" "}
                <Link to="/docs/quick-start" className="text-primary hover:underline">
                  quick-start
                </Link>{" "}
                to make your first /v1 call in under ten minutes.
              </span>
            </li>
            <li className="flex gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              <span>
                Browse the{" "}
                <Link to="/docs/catalogue/services" className="text-primary hover:underline">
                  service catalogue
                </Link>{" "}
                to see what each MDA exposes.
              </span>
            </li>
            <li className="flex gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              <span>
                Open the{" "}
                <Link to="/docs/explorer" className="text-primary hover:underline">
                  API explorer
                </Link>{" "}
                to call /v1 endpoints right from the browser with your key.
              </span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
