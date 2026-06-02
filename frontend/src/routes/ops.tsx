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
// /ops — Operations Console layout shell.
//
// Audience: Sente Rails internal operators + OAG / oversight bodies.
// Auth: Frappe ``sid`` session cookie set by the platform's standard
// /login form. Visitors without a sente role land on a "no access" page;
// guests are sent to /login with a redirect-to.
//
// Visual identity is intentionally denser than the developer hub — this is
// a working surface, not a marketing one. Left sidebar, no top-bar fluff.

import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import {
  ArrowRight,
  Boxes,
  Building2,
  Coins,
  Compass,
  Eye,
  KeyRound,
  LayoutDashboard,
  LogOut,
  ScrollText,
  ServerCog,
  ShieldAlert,
  ShieldCheck,
  Timer,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useOpsWhoami, useOpsSignOut } from "@/lib/ops";

export const Route = createFileRoute("/ops")({
  component: OpsShell,
});

type NavItem = { to: string; label: string; icon: LucideIcon };

const NAV: NavItem[] = [
  { to: "/ops", label: "Overview", icon: LayoutDashboard },
  { to: "/ops/mdas", label: "MDAs", icon: Building2 },
  { to: "/ops/services", label: "Services", icon: Boxes },
  { to: "/ops/integrators", label: "Integrators", icon: Users },
  { to: "/ops/keys", label: "Keys", icon: KeyRound },
  { to: "/ops/audit", label: "Audit log", icon: ScrollText },
  { to: "/ops/oversight", label: "Oversight", icon: Eye },
  { to: "/ops/shifts", label: "Shifts", icon: Timer },
  { to: "/ops/adapters", label: "Adapters", icon: Compass },
  { to: "/ops/system", label: "System", icon: ServerCog },
];

function OpsShell() {
  const location = useLocation();
  const { data: who, isLoading, error } = useOpsWhoami();
  const signOut = useOpsSignOut();

  // Guests bounce to /login. Mounted users without ops access see a guard page.
  useEffect(() => {
    if (isLoading) return;
    // Redirect on EITHER an explicit "not authenticated" response or any
    // whoami fetch error (stale sid cookie, 417/403/5xx, network blip).
    // Before, an errored whoami left `data` undefined and the shell sat
    // on "Checking your session…" forever with no exit.
    const unauthenticated = !!who && !who.authenticated;
    if (unauthenticated || error || !who) {
      window.location.href =
        "/login?redirect-to=" + encodeURIComponent(window.location.pathname);
    }
  }, [isLoading, who, error]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl py-16 text-sm text-muted-foreground">
        Checking your session…
      </div>
    );
  }
  if (!who || !who.authenticated) return null;
  if (!who.has_ops_access) {
    return <NoAccess email={who.user.email} signOut={signOut} />;
  }

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="hidden border-r border-border bg-surface-muted lg:flex lg:flex-col">
        <div className="flex items-center gap-2 border-b border-border px-4 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div className="leading-tight">
            <p className="font-display text-sm font-semibold">Operations</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Sente Rails
            </p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {NAV.map((item) => {
            const active =
              item.to === "/ops"
                ? location.pathname === "/ops" || location.pathname === "/ops/"
                : location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                  active
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <item.icon className="h-3.5 w-3.5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border px-4 py-3 text-xs">
          <p className="truncate font-medium">{who.user.full_name}</p>
          <p className="truncate text-muted-foreground">{who.user.email}</p>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {who.can_write ? "Read + write" : "Read only"}
            </span>
            <button
              type="button"
              onClick={async () => {
                await signOut();
                window.location.href = "/login";
              }}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-3 w-3" /> sign out
            </button>
          </div>
        </div>
      </aside>

      <main className="min-w-0 px-5 py-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}

function NoAccess({ email, signOut }: { email: string; signOut: () => Promise<void> }) {
  return (
    <div className="mx-auto max-w-md py-16">
      <Card className="border-border shadow-sm">
        <CardContent className="p-6 text-center">
          <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-warning/15 text-warning-foreground">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h1 className="font-display text-xl font-semibold">No operator access</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You&apos;re signed in as{" "}
            <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-xs">
              {email}
            </code>
            , but this account doesn&apos;t carry the{" "}
            <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-xs">
              Sente Rails Admin
            </code>{" "}
            or{" "}
            <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-xs">
              Sente Rails OAG
            </code>{" "}
            role required for the Operations Console.
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            Sign in with a different account, or contact ops at{" "}
            <a href="mailto:asatlabs@gmail.com" className="text-primary hover:underline">
              asatlabs@gmail.com
            </a>{" "}
            to request access.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button asChild variant="outline">
              <Link to="/">
                Back to the developer hub <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
            <Button
              onClick={async () => {
                await signOut();
                window.location.href = "/login";
              }}
            >
              <LogOut className="mr-1 h-3.5 w-3.5" /> Sign out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
