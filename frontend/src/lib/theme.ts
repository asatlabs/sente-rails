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
// Theme hook. The FOUC-blocking inline script in __root.tsx applies the
// .dark class to <html> before React paints, so this hook just reads from
// the DOM after mount and exposes a toggle that updates DOM + localStorage.

import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";
const STORAGE_KEY = "sente-theme";

function readFromDom(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function useTheme() {
  // `null` until mounted — lets callers render a stable placeholder during
  // SSR/initial hydration without committing to a wrong icon.
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(readFromDom());
  }, []);

  // Make the hook reactive to the authoritative <html>.dark class.
  //
  // useTheme is per-component local state — each call is an independent
  // useState. Without this, a toggle fired from one component (the top bar)
  // flips <html>.dark + its OWN state, but every OTHER consumer's instance
  // (e.g. the API explorer, which re-keys Scalar on `theme`) never hears
  // about it and stays stale until a full remount. Observing the class
  // attribute makes the DOM the single source of truth: any consumer
  // updates the instant the class changes, regardless of who toggled it.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const el = document.documentElement;
    const obs = new MutationObserver(() => {
      const next: Theme = el.classList.contains("dark") ? "dark" : "light";
      setTheme((prev) => (prev === next ? prev : next));
    });
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  // Honour system preference changes when the user hasn't explicitly chosen.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // localStorage unavailable — fall through.
    }
    if (stored === "light" || stored === "dark") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      const next: Theme = e.matches ? "dark" : "light";
      document.documentElement.classList.toggle("dark", next === "dark");
      setTheme(next);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const toggle = useCallback(() => {
    const isDark = document.documentElement.classList.contains("dark");
    const next: Theme = isDark ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore — user opted out of storage.
    }
    setTheme(next);
  }, []);

  return { theme, toggle };
}
