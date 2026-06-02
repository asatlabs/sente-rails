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
// Marketing footer — three-column link grid + bottom-bar.
//
// The "All systems operational" pill on the bottom-right reads live
// from /v1/ops/system if available; falls back to neutral when the
// public visitor isn't authorized to call it (which is the common case
// for /ops/* — and that's fine: we just don't show a pill).

import { Link } from "@tanstack/react-router";
import { ExternalLink, Github } from "lucide-react";
import { useEffect, useState } from "react";

type FooterLink = { label: string; to?: string; href?: string; external?: boolean };

const COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: "Build",
    links: [
      { label: "Quick start", to: "/docs/quick-start" },
      { label: "API explorer", to: "/docs/explorer" },
      { label: "Agency catalogue", to: "/docs/catalogue/agencies" },
      { label: "Service catalogue", to: "/docs/catalogue/services" },
      { label: "Webhooks", to: "/docs/webhooks" },
      { label: "Sandbox cookbook", to: "/docs/cookbook" },
    ],
  },
  {
    title: "Operate",
    links: [
      { label: "Get a sandbox key", to: "/signup" },
      { label: "Sign in", to: "/signin" },
      { label: "Dashboard", to: "/dashboard" },
      { label: "Security & compliance", to: "/docs/security" },
      { label: "API standards", to: "/docs/api-standards" },
    ],
  },
  {
    title: "About",
    links: [
      { label: "Open source on GitHub", href: "https://github.com/asatlabs/sente-rails", external: true },
      { label: "Apache 2.0 licence", href: "https://github.com/asatlabs/sente-rails/blob/main/LICENSE", external: true },
      { label: "Contact ops", href: "mailto:asatlabs@gmail.com", external: true },
      { label: "Built by ASAT LABS", href: "https://asatlabs.org", external: true },
    ],
  },
];

type HealthShape = {
  adapters?: { live: number | null; stub: number | null };
};

export function MarketingFooter() {
  const [health, setHealth] = useState<HealthShape | null>(null);

  // Try to read system health — visible to ops users only. Public visitors
  // get a 401 and we silently render the neutral "Rail online" pill.
  useEffect(() => {
    let cancelled = false;
    fetch("/v1/ops/system", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled || !json?.data) return;
        setHealth(json.data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <footer className="mt-16 border-t border-border bg-surface-muted">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand column */}
          <div className="lg:col-span-1">
            <p className="font-display text-base font-semibold">Sente Rails</p>
            <p className="mt-2 text-sm text-muted-foreground">
              The open API for Uganda&apos;s government revenue rail.
            </p>
            <a
              href="https://github.com/asatlabs/sente-rails"
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <Github className="h-3.5 w-3.5" />
              asatlabs/sente-rails
            </a>
          </div>

          {/* Link columns */}
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {col.title}
              </p>
              <ul className="mt-3 space-y-2 text-sm">
                {col.links.map((link) =>
                  link.external && link.href ? (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        target={link.href.startsWith("mailto:") ? undefined : "_blank"}
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                      >
                        {link.label}
                        {link.href.startsWith("http") && (
                          <ExternalLink className="h-3 w-3" />
                        )}
                      </a>
                    </li>
                  ) : link.to ? (
                    <li key={link.label}>
                      <Link
                        to={link.to}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ) : null,
                )}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6 text-xs text-muted-foreground">
          <p>
            © {new Date().getFullYear()} ASAT LABS · Apache 2.0 · Republic of Uganda
          </p>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            {health?.adapters
              ? `${health.adapters.live ?? "—"} live · ${health.adapters.stub ?? "—"} stub adapters`
              : "Rail online"}
          </div>
        </div>
      </div>
    </footer>
  );
}
