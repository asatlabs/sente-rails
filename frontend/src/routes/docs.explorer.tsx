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
// /docs/explorer — embedded Scalar reference for the public /v1 surface.
//
// Replaces the standalone Frappe www page (sente_rails/www/api_explorer/)
// so the explorer wears the MarketingShell chrome (top-bar + footer) and
// follows the same dark/light theme as the rest of the site. Scalar brings
// its own operation-list sidebar, so this route deliberately does NOT wrap
// in DocsLayout — that would put two sidebars side-by-side. Instead we
// render a thin page-title strip and let Scalar take the full width below.
//
// The component is dynamic-imported so its bundle stays out of every other
// docs page + out of the SSR pass (Scalar reaches for browser globals on
// import).

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type ComponentType } from "react";
import { ArrowLeft, Download, ExternalLink, FileJson, Info, Loader2, Send, TriangleAlert } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme";

// Scalar dropped auto-CSS injection in 2.x — import the stylesheet directly.
// The chunk is split out by Vite into the docs.explorer route bundle, so
// other routes pay zero bytes for it.
import "@scalar/api-reference-react/style.css";

// Brand override — Scalar reads these CSS variables for its accent + chrome.
// Keeps the explorer visually rooted in the Sente Rails palette (navy
// primary, gold accent) instead of Scalar's stock purple.
//
// --scalar-custom-header-height is the variable Scalar uses to offset
// its sticky positioning. We set it to 60px (4px gov-accent-bar +
// 56px h-14 top-bar) so Scalar's sticky internal header / sidebar
// hugs the workbench top-bar instead of the viewport edge.
//
// Mode-scoped variables: Scalar applies its OWN `.light-mode` / `.dark-mode`
// class to the `.scalar-app` root and defines its palette under
// `.scalar-app.light-mode` / `.scalar-app.dark-mode` (specificity 0,2,0).
// A plain `:root` / `.dark` override (0,1,0) LOSES to Scalar's own values,
// which is why the brand navy/gold never reached the explorer in dark mode.
// We match Scalar's selector specificity AND load later (customCss is
// appended after Scalar's stylesheet), so ours wins. Non-mode tokens
// (radius, font, header offset) stay on :root.
const SENTE_SCALAR_CSS = `
:root {
  --scalar-custom-header-height: 60px;
  --scalar-radius: 6px;
  --scalar-radius-lg: 10px;
  --scalar-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  --scalar-font-code: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
}
.light-mode,
.scalar-app.light-mode {
  --scalar-color-accent: #0a2540;
  --scalar-color-1: #1a1a1a;
  --scalar-color-2: #4b5563;
  --scalar-color-3: #6b7280;
  --scalar-button-1: #0a2540;
  --scalar-button-1-color: #ffffff;
  --scalar-button-1-hover: #11335a;
  --scalar-border-color: #e5e7eb;
}
.dark-mode,
.scalar-app.dark-mode {
  --scalar-color-accent: #fcdc04;
  --scalar-color-1: #f5f7fa;
  --scalar-color-2: #d1d5db;
  --scalar-color-3: #9ca3af;
  --scalar-button-1: #fcdc04;
  --scalar-button-1-color: #0a2540;
  --scalar-button-1-hover: #ffe33e;
  --scalar-background-1: #0a0e1a;
  --scalar-background-2: #111827;
  --scalar-background-3: #1f2937;
  --scalar-border-color: #1f2937;
}

/* Width unity — constrain Scalar's fixed/portaled overlays (the API-client
   test console + any modal) to the same max-w-7xl rail as the rest of the
   page. The backdrop stays full-viewport (dims the edges); only the panel
   content is centered to the rail so the explorer reads as one unit. */
.scalar-app .scalar-modal,
.scalar-modal,
.scalar-client,
.scalar-api-client {
  max-width: 80rem;
  margin-inline: auto;
}
`;

export const Route = createFileRoute("/docs/explorer")({
  head: () => ({
    meta: [
      { title: "API explorer · Sente Rails" },
      {
        name: "description",
        content:
          "Live OpenAPI 3.1 reference for the Sente Rails public /v1 surface.",
      },
    ],
  }),
  component: ExplorerPage,
});

type ScalarComponent = ComponentType<{ configuration: Record<string, unknown> }>;

async function loadSpec(): Promise<Record<string, unknown>> {
  const res = await fetch("/v1/openapi.json", {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Failed to load spec (HTTP ${res.status})`);
  }
  const body = (await res.json()) as { data?: Record<string, unknown> };
  // /v1 responses are wrapped in { data: ... } by the response_shape
  // middleware. Unwrap before handing to Scalar.
  if (!body || typeof body !== "object" || !body.data) {
    throw new Error("Spec response missing data envelope");
  }
  return body.data;
}

// Module-level memoized loaders. Both the Scalar chunk (large) and the spec
// fetch used to start in useEffect — i.e. AFTER first paint — which is why
// the explorer popped in seconds late. Hoisting them to module scope and
// warming them at chunk-eval means the router's `defaultPreload: "intent"`
// (router.tsx) starts both downloads on HOVER over the "API explorer" nav
// link, often before the click lands. Memoized so repeat mounts (e.g. the
// theme re-key) reuse the in-flight/resolved promise instead of refetching.
let _scalarPromise: Promise<ScalarComponent> | null = null;
let _specPromise: Promise<Record<string, unknown>> | null = null;

function getScalar(): Promise<ScalarComponent> {
  // Scalar reaches for browser globals on import, so it must never load on
  // the server. The `typeof window` guard at the call site keeps this
  // client-only; the import itself is also code-split by Vite.
  _scalarPromise ??= import("@scalar/api-reference-react").then(
    (mod) => mod.ApiReferenceReact,
  );
  return _scalarPromise;
}

function getSpec(): Promise<Record<string, unknown>> {
  _specPromise ??= loadSpec();
  return _specPromise;
}

// Warm both caches the moment this route chunk evaluates on the client.
// With intent-preloading that's on hover, before navigation. No-op on the
// server (Scalar can't import there; spec fetch is pointless pre-paint).
if (typeof window !== "undefined") {
  getScalar().catch(() => {});
  getSpec().catch(() => {});
}

const POSTMAN_COLLECTION_URL = "https://sente-rails.space/v1/openapi.postman.json";
const POSTMAN_DEEPLINK = `postman://import?url=${POSTMAN_COLLECTION_URL}`;

function ExplorerPage() {
  const { theme } = useTheme();
  const [Scalar, setScalar] = useState<ScalarComponent | null>(null);
  const [spec, setSpec] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [postmanFallbackOpen, setPostmanFallbackOpen] = useState(false);

  // No auto-detect — Chrome's native "Open Postman?" confirmation is an
  // in-tab overlay that doesn't change `document.visibilityState`,
  // `document.hasFocus()`, or fire `blur`/`focus` in a way the page can
  // distinguish from "no handler at all." Any timer-based heuristic
  // races against the user's reaction time on Chrome's prompt and
  // results in the help dialog opening BEHIND Chrome's prompt while
  // the user is mid-click. Just fire the deeplink and let Chrome's
  // prompt do its job; surface the help affordance separately so users
  // who genuinely couldn't open Postman can reach for it deliberately.
  function openInPostman() {
    if (typeof window === "undefined") return;
    window.location.href = POSTMAN_DEEPLINK;
  }

  useEffect(() => {
    let cancelled = false;
    // Resolve from the module-level memoized promises. If the router
    // preloaded this chunk on hover, both are already in flight (or done)
    // and this is near-instant.
    Promise.all([getScalar(), getSpec()])
      .then(([component, specData]) => {
        if (cancelled) return;
        setScalar(() => component);
        setSpec(specData);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Silence Scalar's URL-hash scroll-spy.
  //
  // Forensic findings:
  //  - Scalar's `useNavState.replaceUrlState` fires `history.replaceState`
  //    on every IntersectionObserver tick — the URL bar updates to the
  //    section currently in view (e.g. #description/three-interaction-modes).
  //  - The router runs `scrollRestoration: true` (router.tsx); even
  //    though replaceState doesn't fire popstate, the URL churn shows in
  //    the address bar and causes the sidebar's "active item" highlight
  //    to cycle visibly, which the user reads as disorientation while
  //    trying to scroll precisely.
  //
  // Fix: intercept history.replaceState/pushState on mount and no-op
  // hash-only changes. The sidebar still highlights internally via
  // Scalar's own state (the `i.value = e` assignment in useNavState),
  // but the URL bar stays stable and the visible cycling is gone.
  // Restored on unmount so other routes are unaffected.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const origReplace = window.history.replaceState.bind(window.history);
    const origPush = window.history.pushState.bind(window.history);

    function isHashOnlyChange(url: string | URL | null | undefined): boolean {
      if (!url) return false;
      try {
        const next = new URL(String(url), window.location.href);
        const cur = new URL(window.location.href);
        return next.pathname === cur.pathname && next.search === cur.search;
      } catch {
        return false;
      }
    }

    window.history.replaceState = (data, unused, url) => {
      if (isHashOnlyChange(url)) return;
      return origReplace(data, unused, url ?? null);
    };
    window.history.pushState = (data, unused, url) => {
      if (isHashOnlyChange(url)) return;
      return origPush(data, unused, url ?? null);
    };
    return () => {
      window.history.replaceState = origReplace;
      window.history.pushState = origPush;
    };
  }, []);

  // Force Scalar's color-mode class to track the app theme.
  //
  // Forensic finding: Scalar runs its own color-mode system that writes
  // `.dark-mode` / `.light-mode` onto <document.body>, and in this version
  // (@scalar/api-reference-react 0.7.55) `forceDarkModeState` reliably
  // forces "dark" but NOT "light" — a light app theme can leave Scalar
  // stuck on a persisted/system-preference dark class. That's the exact
  // asymmetry we see: dark mode is coherent, light mode shows a dark panel.
  //
  // Rather than redefine Scalar's entire palette (fragile token whack-a-
  // mole), we correct the single thing that's wrong: the mode class. With
  // the right class set, Scalar's OWN complete light/dark palette applies,
  // and our brand-accent customCss (scoped under .light-mode/.dark-mode)
  // layers on top. A MutationObserver re-asserts if Scalar flips it back
  // asynchronously after mount. The app's <html>.dark class stays the
  // single source of truth.
  useEffect(() => {
    if (typeof document === "undefined" || !theme) return;
    if (!Scalar || !spec) return;
    const want = theme === "dark" ? "dark-mode" : "light-mode";
    const drop = theme === "dark" ? "light-mode" : "dark-mode";
    const apply = () => {
      const b = document.body;
      if (b.classList.contains(want) && !b.classList.contains(drop)) return;
      b.classList.add(want);
      b.classList.remove(drop);
    };
    apply();
    const obs = new MutationObserver(apply);
    obs.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, [theme, Scalar, spec]);

  return (
    // Natural page flow. Scalar handles its own sticky sidebar +
    // internal scroll via the --scalar-custom-header-height var
    // (set in SENTE_SCALAR_CSS to 60px = workbench top-bar height).
    // The page itself scrolls normally; sidebar follows via sticky.
    // Footer renders below as part of MarketingShell.
    <div className="flex flex-col bg-background">
      {/* Page-title strip — sticky so the breadcrumb + Download
          button stay visible while reading further down. */}
      <div className="border-b border-border bg-surface-muted">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Link to="/docs" className="hover:text-foreground">
                <span className="inline-flex items-center gap-1">
                  <ArrowLeft className="h-3 w-3" /> Documentation
                </span>
              </Link>
              <span aria-hidden>›</span>
              <span className="text-foreground">API explorer</span>
            </div>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Live OpenAPI 3.1 reference. Every endpoint runs against the
              sandbox at{" "}
              <code className="rounded bg-background px-1 py-0.5 font-mono text-[11.5px] text-foreground">
                sente-rails.space/v1
              </code>
              .
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="/v1/openapi.json"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:border-primary/40"
              target="_blank"
              rel="noreferrer"
              title="Download the OpenAPI 3.1 spec as JSON"
            >
              <FileJson className="h-3.5 w-3.5" />
              OpenAPI spec
            </a>
            <a
              href="/v1/openapi.postman.json"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:border-primary/40"
              download="sente-rails.postman_collection.json"
              title="Postman Collection v2.1 — 19 folders, 101 requests, baseUrl + apiKey variables."
            >
              <FileJson className="h-3.5 w-3.5" />
              Postman collection
            </a>
            <button
              type="button"
              onClick={openInPostman}
              className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-foreground hover:border-primary/70 focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              title="Open in Postman desktop (requires Postman installed)"
            >
              <Send className="h-3.5 w-3.5" />
              Open in Postman desktop
            </button>
            <button
              type="button"
              onClick={() => setPostmanFallbackOpen(true)}
              className="rounded text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              title="Postman didn't open? Get help."
            >
              Didn&rsquo;t open?
            </button>
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded text-[11px] text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <Info className="h-3 w-3" />
                    How to import
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="end" className="max-w-xs text-left">
                  <p className="font-medium">Import into Postman</p>
                  <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-[11px] leading-relaxed">
                    <li>Click <span className="font-semibold">Postman collection</span> to download the file.</li>
                    <li>Open Postman, click <span className="font-semibold">Import</span> (top-left).</li>
                    <li>Drag the <code className="rounded bg-primary/30 px-1 text-[10px]">.postman_collection.json</code> file in.</li>
                    <li>Open the collection's <span className="font-semibold">Variables</span> tab and set <code className="rounded bg-primary/30 px-1 text-[10px]">apiKey</code> to your sandbox key.</li>
                  </ol>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>

      {/* Scalar mount — Scalar's standalone layout (.scalar-app) uses
          `min-height: 100dvh` internally and handles its own sticky
          sidebar via --scalar-custom-header-height. Constrained to the
          same max-w-7xl rail as the top bar + title strip so the
          explorer's sidebar/content edges line up with the header
          instead of running full-bleed. */}
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        {error && (
          <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 lg:px-8">
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              <p className="font-medium">Couldn&apos;t load the API spec</p>
              <p className="mt-1 text-xs opacity-80">{error}</p>
            </div>
          </div>
        )}
        {!error && (!Scalar || !spec) && (
          <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-12 text-sm text-muted-foreground sm:px-6 lg:px-8">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading API reference…
          </div>
        )}
        {Scalar && spec && (
          <Scalar
            // Re-key on theme so the toggle actually reaches Scalar. The
            // web component reads `configuration` only at mount and ignores
            // later prop changes; keying by theme forces a remount with the
            // fresh forceDarkModeState. Cheap — spec + component are already
            // in memory, so it's a re-init, not a refetch.
            key={theme}
            configuration={{
              // Scalar 2.x: spec lives at the top level. spec.content was
              // deprecated; using it now warns and is removed in 3.x.
              content: spec,
              theme: "default",
              layout: "modern",
              showSidebar: true,
              // Scalar 2.x: use documentDownloadType instead of
              // hideDownloadButton. "none" suppresses the built-in
              // download menu — we render our own button in the title strip.
              documentDownloadType: "none",
              hideClientButton: false,
              // Lock Scalar's mode to the app's theme and hide Scalar's own
              // toggle so the workbench moon/sun is the single source of
              // truth. forceDarkModeState overrides Scalar's localStorage
              // colorMode; hideDarkModeToggle removes the rival control.
              darkMode: theme === "dark",
              forceDarkModeState: theme,
              hideDarkModeToggle: true,
              customCss: SENTE_SCALAR_CSS,
              metaData: { title: "Sente Rails API" },
              defaultOpenAllTags: false,
              hideTestRequestButton: false,
              hiddenClients: [],
            }}
          />
        )}
      </div>

      {/* Opened only when the user explicitly clicks "Didn't open?".
          NEVER auto-shown — Chrome's native confirm overlay can't be
          distinguished from "no handler at all" by the page, so any
          timer-based attempt to detect failure shows this dialog
          behind Chrome's prompt while the user is mid-decision. */}
      <Dialog open={postmanFallbackOpen} onOpenChange={setPostmanFallbackOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TriangleAlert className="h-5 w-5 text-warning-foreground" />
              Trouble opening Postman?
            </DialogTitle>
            <DialogDescription>
              The browser-to-app handoff relies on the{" "}
              <code className="rounded bg-surface-muted px-1 text-[11px]">postman://</code> URL
              scheme being registered with your OS. Two common reasons it
              doesn&rsquo;t work: Postman desktop isn&rsquo;t installed yet,
              or it&rsquo;s installed but the scheme didn&rsquo;t register.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-sm">
            <div>
              <p className="font-medium text-foreground">Don&rsquo;t have Postman yet?</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Postman is a free desktop API client. Download the macOS / Windows / Linux
                build from the official site:
              </p>
              <a
                href="https://www.postman.com/downloads/"
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:border-primary/40"
              >
                postman.com/downloads
                <ExternalLink className="h-3 w-3" />
              </a>
              <p className="mt-2 text-[11px] text-muted-foreground">
                On Apple Silicon (M-series) Macs with Homebrew, the one-liner is{" "}
                <code className="rounded bg-surface-muted px-1 font-mono text-[10.5px]">brew install --cask postman</code>.
              </p>
            </div>

            <div className="border-t border-border pt-4">
              <p className="font-medium text-foreground">Already have Postman installed?</p>
              <p className="mt-1 text-xs text-muted-foreground">
                The protocol handler may not be registered. Try launching Postman from
                Applications / Spotlight once, then come back and click the button
                again. Or skip the deeplink entirely:
              </p>
              <a
                href="/v1/openapi.postman.json"
                download="sente-rails.postman_collection.json"
                className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-foreground hover:border-primary/70"
              >
                <Download className="h-3.5 w-3.5" />
                Download collection instead
              </a>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Then in Postman: <span className="font-semibold">Import</span> (top-left) →
                drag the downloaded file in.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPostmanFallbackOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
