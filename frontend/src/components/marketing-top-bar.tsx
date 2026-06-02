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
// Marketing top-bar — sticky, auth-aware.
//
// Used on every surface except /ops/* and /work/* (which carry their own
// kiosk/admin shells). Right side flips between guest CTAs and the
// signed-in integrator's menu via useSession (from A.2).

import { Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { LogOut, Menu, Moon, ShieldCheck, Sun, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession, useSignOut } from "@/lib/session";
import { useTheme } from "@/lib/theme";

const NAV_LINKS = [
  { to: "/docs", label: "Docs" },
  { to: "/docs/catalogue/agencies", label: "Catalogue" },
  { to: "/docs/explorer", label: "API explorer" },
];

export function MarketingTopBar() {
  const router = useRouter();
  const { data: session } = useSession();
  const signOut = useSignOut();
  const { theme, toggle: toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const authed = session?.authenticated === true;
  const integrator = authed ? session.integrator : null;

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
      <div className="gov-accent-bar h-1 w-full" />
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
        {/* Brand */}
        <Link to="/" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div className="hidden flex-col leading-tight sm:flex">
            <span className="font-display text-sm font-semibold">Sente Rails</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Republic of Uganda
            </span>
          </div>
        </Link>

        {/* Desktop nav */}
        <nav className="ml-6 hidden items-center gap-1 text-sm md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
              activeProps={{ className: "text-foreground" }}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            className="h-8 w-8 p-0"
            suppressHydrationWarning
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>

          {authed && integrator ? (
            <>
              <div className="hidden text-right leading-tight sm:block">
                <p className="text-sm font-medium">{integrator.display_name}</p>
                <p className="text-[11px] font-mono text-muted-foreground">
                  {integrator.code}
                </p>
              </div>
              <Button asChild size="sm">
                <Link to="/dashboard">Dashboard</Link>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  await signOut();
                  router.navigate({ to: "/" });
                }}
                aria-label="Sign out"
              >
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : (
            <>
              <Button asChild size="sm" variant="ghost" className="hidden sm:inline-flex">
                <Link to="/signin">Sign in</Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/signup">Get a sandbox key</Link>
              </Button>
            </>
          )}

          {/* Mobile toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label="Toggle navigation"
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Mobile nav drawer */}
      {mobileOpen && (
        <div className="border-t border-border bg-background md:hidden">
          <nav className="flex flex-col px-4 py-3 text-sm">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="rounded-md px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => setMobileOpen(false)}
                activeProps={{ className: "text-foreground" }}
              >
                {link.label}
              </Link>
            ))}
            {!authed && (
              <Link
                to="/signin"
                className="rounded-md px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground sm:hidden"
                onClick={() => setMobileOpen(false)}
              >
                Sign in
              </Link>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
