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
// DocsLayout — three-column shell shared by every /docs sub-page.
//   left sub-nav (sticky, 240px)        — section index
//   centre prose                         — the page content
//   right TOC (sticky, 200px, lg only)   — auto-built from H2/H3
//
// Wraps each docs sub-route via the parent `/docs` route's <Outlet>.

import { Link, useLocation, useRouter } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

type DocLink = { to: string; label: string };
type DocGroup = { title: string; links: DocLink[] };

const SECTIONS: DocGroup[] = [
  {
    title: "Get started",
    links: [{ to: "/docs/quick-start", label: "Quick start" }],
  },
  {
    title: "Concepts",
    links: [
      { to: "/docs/security", label: "Security & compliance" },
      { to: "/docs/api-standards", label: "API standards" },
    ],
  },
  {
    title: "Catalogue",
    links: [
      { to: "/docs/catalogue/agencies", label: "Agencies" },
      { to: "/docs/catalogue/services", label: "Services" },
    ],
  },
  {
    title: "Reference",
    links: [
      { to: "/docs/sdks", label: "SDKs & samples" },
      { to: "/docs/webhooks", label: "Webhooks" },
      { to: "/docs/cookbook", label: "Sandbox cookbook" },
      { to: "/docs/explorer", label: "API explorer" },
    ],
  },
];

function DocsNav() {
  const location = useLocation();
  return (
    <nav className="space-y-6 text-sm" aria-label="Documentation sections">
      <Link
        to="/docs"
        className={`block font-medium ${
          location.pathname === "/docs"
            ? "text-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Overview
      </Link>
      {SECTIONS.map((group) => (
        <div key={group.title}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {group.title}
          </p>
          <ul className="space-y-1.5">
            {group.links.map((link) => {
              const active = location.pathname === link.to;
              return (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    className={`block rounded-md px-2 py-1 transition-colors ${
                      active
                        ? "bg-primary/5 font-medium text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <div className="border-t border-border pt-4">
        <Link
          to="/docs/explorer"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80"
        >
          Open API reference <ArrowUpRight className="h-3 w-3" />
        </Link>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Live OpenAPI 3.1 explorer
        </p>
      </div>
    </nav>
  );
}

type TocEntry = { id: string; text: string; level: 2 | 3 };

function DocsTOC() {
  const router = useRouter();
  const [entries, setEntries] = useState<TocEntry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    // Re-collect headings after the route resolves and the DOM settles.
    const collect = () => {
      const main = document.querySelector<HTMLElement>("[data-docs-main]");
      if (!main) return;
      const headings = Array.from(
        main.querySelectorAll<HTMLHeadingElement>("h2[id], h3[id]"),
      );
      setEntries(
        headings.map((h) => ({
          id: h.id,
          text: h.textContent?.trim() ?? "",
          level: (h.tagName === "H2" ? 2 : 3) as 2 | 3,
        })),
      );
    };
    collect();
    const t = setTimeout(collect, 60);
    return () => clearTimeout(t);
  }, [router.state.location.pathname]);

  useEffect(() => {
    if (entries.length === 0) return;
    const observer = new IntersectionObserver(
      (changes) => {
        const visible = changes
          .filter((c) => c.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "0px 0px -70% 0px", threshold: 0 },
    );
    entries.forEach((e) => {
      const el = document.getElementById(e.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [entries]);

  if (entries.length === 0) return null;

  return (
    <aside className="sticky top-6 hidden text-sm lg:block" aria-label="On this page">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        On this page
      </p>
      <ul className="space-y-1.5 border-l border-border">
        {entries.map((e) => {
          const active = e.id === activeId;
          return (
            <li key={e.id}>
              <a
                href={`#${e.id}`}
                className={`-ml-px block border-l-2 ${
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                } py-0.5 ${e.level === 3 ? "pl-6" : "pl-3"} text-[12.5px] transition-colors`}
              >
                {e.text}
              </a>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

export type DocPageProps = {
  /** Eyebrow text above the H1, e.g. "Get started". */
  eyebrow: string;
  title: string;
  description?: string;
  children: ReactNode;
  /** Optional next-step links rendered as a footer card row. */
  next?: { to: string; label: string; description?: string }[];
};

export function DocPage({ eyebrow, title, description, children, next }: DocPageProps) {
  return (
    <article className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-wider text-primary">{eyebrow}</p>
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-foreground">
        {title}
      </h1>
      {description && (
        <p className="mt-3 text-base text-muted-foreground">{description}</p>
      )}
      <div className="mt-8 max-w-none">{children}</div>
      {next && next.length > 0 && (
        <div className="mt-12 border-t border-border pt-6">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Next up
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {next.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className="group rounded-md border border-border bg-card p-4 transition-colors hover:border-primary/40"
              >
                <p className="flex items-center justify-between font-medium text-foreground">
                  {n.label}
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                </p>
                {n.description && (
                  <p className="mt-1 text-sm text-muted-foreground">{n.description}</p>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

export function DocsLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  // The /docs index has no H2/H3, so the auto-TOC would render as an empty
  // 180px column. Drop the reservation on the index and let the card grid
  // span the freed width instead.
  const isIndex = location.pathname === "/docs" || location.pathname === "/docs/";
  // The explorer renders its own page-title strip + Scalar layout (its own
  // operation-list sidebar). Bypass the docs grid entirely so Scalar gets
  // every horizontal pixel below the MarketingTopBar.
  const isExplorer = location.pathname.startsWith("/docs/explorer");
  if (isExplorer) return <>{children}</>;
  return (
    <div
      className={`mx-auto grid max-w-7xl grid-cols-1 gap-8 px-4 py-10 sm:px-6 lg:gap-10 lg:px-8 lg:py-12 ${
        isIndex
          ? "lg:grid-cols-[200px_minmax(0,1fr)]"
          : "lg:grid-cols-[200px_minmax(0,1fr)_180px]"
      }`}
    >
      <aside className="lg:sticky lg:top-20 lg:self-start">
        <DocsNav />
      </aside>
      <main data-docs-main className="min-w-0">
        {children}
      </main>
      {!isIndex && <DocsTOC />}
    </div>
  );
}

// Helper for headings used inside docs prose so they auto-register with the TOC.
export function H2({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2
      id={id}
      className="mt-10 scroll-mt-24 font-display text-xl font-semibold tracking-tight text-foreground first:mt-0"
    >
      {children}
    </h2>
  );
}

export function H3({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h3
      id={id}
      className="mt-6 scroll-mt-24 font-display text-base font-semibold text-foreground"
    >
      {children}
    </h3>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p className="mt-3 text-[14.5px] leading-relaxed text-muted-foreground">{children}</p>;
}

export function UL({ children }: { children: ReactNode }) {
  return (
    <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[14.5px] leading-relaxed text-muted-foreground marker:text-muted-foreground/60">
      {children}
    </ul>
  );
}

export function OL({ children }: { children: ReactNode }) {
  return (
    <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[14.5px] leading-relaxed text-muted-foreground marker:text-muted-foreground/60">
      {children}
    </ol>
  );
}

export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-[12.5px] text-foreground">
      {children}
    </code>
  );
}

export function A({ to, href, children }: { to?: string; href?: string; children: ReactNode }) {
  if (to) {
    return (
      <Link to={to} className="text-primary underline-offset-2 hover:underline">
        {children}
      </Link>
    );
  }
  return (
    <a
      href={href}
      target={href?.startsWith("http") ? "_blank" : undefined}
      rel="noreferrer"
      className="text-primary underline-offset-2 hover:underline"
    >
      {children}
    </a>
  );
}
