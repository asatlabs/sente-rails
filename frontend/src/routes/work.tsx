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
// /work — Counter Stations app shell: a fixed sidebar, a context top-bar with
// the live shift status, and the work surfaces in the content area. Auth-gated
// to Sente Rails Clerk / Supervisor / Admin.

import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import {
  ArrowRight,
  Building2,
  Clock,
  History as HistoryIcon,
  LayoutGrid,
  LogOut,
  Receipt,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useActiveShift, useWorkWhoami, useWorkSignOut, type WorkWhoami } from "@/lib/work";

export const Route = createFileRoute("/work")({
  component: WorkShell,
});

type NavDef = { to: string; label: string; icon: typeof Receipt; match: (p: string) => boolean; show: (w: WorkWhoami & { authenticated: true }) => boolean };

const NAV: NavDef[] = [
  {
    to: "/work/assess",
    label: "Counter",
    icon: Receipt,
    match: (p) => p.startsWith("/work/assess") || p.startsWith("/work/collect"),
    show: (w) => w.is_clerk,
  },
  {
    to: "/work/shift",
    label: "Shift",
    icon: Clock,
    match: (p) => p === "/work/shift" || p === "/work",
    show: (w) => w.is_clerk,
  },
  {
    to: "/work/history",
    label: "History",
    icon: HistoryIcon,
    match: (p) => p.startsWith("/work/history"),
    show: (w) => w.is_clerk,
  },
  {
    to: "/work/supervisor",
    label: "Oversight",
    icon: ShieldCheck,
    match: (p) => p.startsWith("/work/supervisor"),
    show: (w) => w.is_supervisor || w.is_admin,
  },
];

function WorkShell() {
  const location = useLocation();
  const { data: who, isLoading, error } = useWorkWhoami();
  const signOut = useWorkSignOut();

  useEffect(() => {
    if (isLoading) return;
    const unauthenticated = !!who && !who.authenticated;
    if (unauthenticated || error || !who) {
      window.location.href = "/login?redirect-to=" + encodeURIComponent(window.location.pathname);
    }
  }, [isLoading, who, error]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-lg text-muted-foreground">Checking your session…</p>
      </div>
    );
  }
  if (!who || !who.authenticated) return null;
  if (!who.has_work_access) return <NoAccess email={who.user.email} signOut={signOut} />;

  const nav = NAV.filter((n) => n.show(who));
  const active = nav.find((n) => n.match(location.pathname));
  const roleLabel = who.is_supervisor ? "Supervisor" : who.is_clerk ? "Clerk" : "Admin";

  async function doSignOut() {
    await signOut();
    window.location.href = "/login";
  }

  return (
    <div className="min-h-screen bg-surface-muted">
      <div className="gov-accent-bar" />
      <div className="lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
        {/* ── Sidebar ─────────────────────────────────────────────── */}
        <aside className="sticky top-0 hidden h-screen flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
          <div className="flex items-center gap-2.5 px-5 py-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
              <Building2 className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <p className="font-display text-base font-semibold">Sente Counter</p>
              <p className="text-[11px] uppercase tracking-wider text-sidebar-foreground/60">
                {who.clerk_mda ?? "Fleet"}
              </p>
            </div>
          </div>

          <nav className="flex-1 space-y-1 px-3 py-2">
            {nav.map((n) => {
              const isActive = active?.to === n.to;
              const Icon = n.icon;
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors ${
                    isActive
                      ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {n.label}
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-sidebar-border p-3">
            <div className="flex items-center gap-2.5 rounded-md px-2 py-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-sm font-semibold text-sidebar-accent-foreground">
                {initials(who.user.full_name)}
              </div>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-sm font-medium">{who.user.full_name}</p>
                <p className="text-[11px] text-sidebar-foreground/60">{roleLabel}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 w-full justify-start text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
              onClick={doSignOut}
            >
              <LogOut className="mr-2 h-3.5 w-3.5" /> Sign out
            </Button>
          </div>
        </aside>

        {/* ── Main column ─────────────────────────────────────────── */}
        <div className="flex min-h-screen flex-col">
          {/* Mobile brand + nav (sidebar hidden under lg) */}
          <div className="flex items-center justify-between border-b border-border bg-background px-4 py-3 lg:hidden">
            <div className="flex items-center gap-2">
              <LayoutGrid className="h-5 w-5 text-primary" />
              <span className="font-display font-semibold">Sente Counter</span>
            </div>
            <Button variant="ghost" size="sm" onClick={doSignOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
          <nav className="flex gap-1 overflow-x-auto border-b border-border bg-background px-2 py-2 lg:hidden">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm ${
                  active?.to === n.to ? "bg-primary/10 text-primary" : "text-muted-foreground"
                }`}
              >
                {n.label}
              </Link>
            ))}
          </nav>

          {/* Context top-bar */}
          <header className="hidden items-center justify-between border-b border-border bg-background px-6 py-3.5 lg:flex">
            <h1 className="font-display text-lg font-semibold">{active?.label ?? "Counter"}</h1>
            {who.clerk_mda && <ShiftPill mda={who.clerk_mda} />}
          </header>

          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-6xl">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function ShiftPill({ mda }: { mda: string }) {
  const { data: shift } = useActiveShift(mda);
  if (shift && shift.status === "Open") {
    return (
      <div className="flex items-center gap-2 rounded-full border border-success/30 bg-success/10 px-3 py-1.5 text-sm">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
        </span>
        <span className="font-medium text-success">Shift open</span>
        <span className="text-muted-foreground">
          · {shift.counter_label || mda}
          {shift.opened_at ? ` · ${relTime(shift.opened_at)}` : ""}
        </span>
      </div>
    );
  }
  return (
    <Link
      to="/work/shift"
      className="flex items-center gap-2 rounded-full border border-border bg-surface-muted px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <span className="h-2 w-2 rounded-full bg-muted-foreground/50" /> No open shift — open one
    </Link>
  );
}

function initials(name: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function relTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.max(0, Math.floor((Date.now() - then) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function NoAccess({ email, signOut }: { email: string; signOut: () => Promise<void> }) {
  return (
    <div className="mx-auto max-w-md py-16">
      <Card className="border-border shadow-sm">
        <CardContent className="p-6 text-center">
          <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-warning/15 text-warning-foreground">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h1 className="font-display text-xl font-semibold">No counter access</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Signed in as <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-xs">{email}</code>,
            but this account doesn&apos;t carry the Clerk or Supervisor role.
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
