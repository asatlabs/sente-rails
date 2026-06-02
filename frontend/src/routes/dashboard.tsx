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
// /dashboard — layout shell shared by every dashboard sub-page.
// Top-level tabs (Overview / Keys / Logs / Settings / Billing) + the
// auth guard. Anyone not signed in is redirected to /signin.

import { createFileRoute, Link, Outlet, useLocation, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import {
  Coins,
  KeyRound,
  LayoutGrid,
  Loader2,
  ScrollText,
  Settings as SettingsIcon,
  type LucideIcon,
} from "lucide-react";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/dashboard")({
  component: DashboardShell,
});

type Tab = { to: string; label: string; icon: LucideIcon };

const TABS: Tab[] = [
  { to: "/dashboard", label: "Overview", icon: LayoutGrid },
  { to: "/dashboard/keys", label: "Keys", icon: KeyRound },
  { to: "/dashboard/logs", label: "Logs", icon: ScrollText },
  { to: "/dashboard/settings", label: "Settings", icon: SettingsIcon },
  { to: "/dashboard/billing", label: "Billing", icon: Coins },
];

function DashboardShell() {
  const router = useRouter();
  const location = useLocation();
  const { data: session, isLoading, error } = useSession();

  useEffect(() => {
    if (isLoading) return;
    // Redirect on EITHER an explicit "not authenticated" response or any
    // session fetch error (stale sid cookie, 417/403/5xx, network blip).
    // Before, an errored session left `data` undefined and the shell sat
    // on "Checking your session…" forever with no exit.
    const unauthenticated = !!session && !session.authenticated;
    if (unauthenticated || error || !session) {
      router.navigate({ to: "/signin" });
    }
  }, [isLoading, session, router, error]);

  if (isLoading) {
    return (
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-10 text-sm text-muted-foreground sm:px-6 lg:px-8">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking your session…
      </div>
    );
  }
  if (!session || !session.authenticated) return null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <nav className="-mb-px flex flex-wrap gap-1 border-b border-border" aria-label="Dashboard sections">
        {TABS.map((t) => {
          const active = t.to === "/dashboard"
            ? location.pathname === "/dashboard" || location.pathname === "/dashboard/"
            : location.pathname.startsWith(t.to);
          return (
            <Link
              key={t.to}
              to={t.to}
              className={`-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm transition-colors ${
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
              }`}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-6">
        <Outlet />
      </div>
    </div>
  );
}
